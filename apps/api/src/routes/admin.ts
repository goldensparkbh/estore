import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { BillingInterval, Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requirePlatformAdmin } from "../middleware/platform-admin.js";
import { addBillingPeriod, changePlanForTenant, parsePlanFeatures } from "../services/billing.js";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const iss of parsed.error.issues) {
      const k = iss.path.join(".") || "body";
      errors[k] ??= [];
      errors[k].push(iss.message);
    }
    throw new AppError(400, "Validation Error", "Request body failed validation.", undefined, errors);
  }
  return parsed.data;
}

const planFeaturesSchema = z.object({
  modules: z.object({
    inventory: z.boolean(),
    pos: z.boolean(),
    hr: z.boolean(),
  }),
  maxWarehouses: z.number().int().positive().optional(),
  maxProducts: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
});

const planBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens"),
  description: z.string().max(2000).optional().nullable(),
  billingInterval: z.enum(["MONTHLY", "ANNUAL"]).nullable().optional(),
  priceAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currencyCode: z.string().length(3).optional(),
  isFreeTier: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  features: planFeaturesSchema,
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

function serializePlan(p: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  billingInterval: BillingInterval | null;
  priceAmount: { toString(): string };
  currencyCode: string;
  isFreeTier: boolean;
  trialDays: number;
  features: unknown;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { subscriptions: number };
}) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    billingInterval: p.billingInterval,
    priceAmount: p.priceAmount.toString(),
    currencyCode: p.currencyCode,
    isFreeTier: p.isFreeTier,
    trialDays: p.trialDays,
    features: parsePlanFeatures(p.features),
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    subscriptionCount: p._count?.subscriptions ?? 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeSubscription(
  s: {
    id: string;
    status: SubscriptionStatus;
    startedAt: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    tenant: { id: string; name: string; slug: string };
    plan: {
      id: string;
      name: string;
      slug: string;
      isFreeTier: boolean;
      priceAmount: { toString(): string };
      currencyCode: string;
      billingInterval: BillingInterval | null;
      features: unknown;
    };
  },
) {
  return {
    id: s.id,
    status: s.status,
    startedAt: s.startedAt.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    tenant: s.tenant,
    plan: {
      id: s.plan.id,
      name: s.plan.name,
      slug: s.plan.slug,
      isFreeTier: s.plan.isFreeTier,
      priceAmount: s.plan.priceAmount.toString(),
      currencyCode: s.plan.currencyCode,
      billingInterval: s.plan.billingInterval,
      features: parsePlanFeatures(s.plan.features),
    },
  };
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/stats", async (request) => {
    requirePlatformAdmin(request);
    const now = new Date();
    const in30 = new Date();
    in30.setUTCDate(in30.getUTCDate() + 30);

    const [
      tenantCount,
      planCount,
      activeSubscriptions,
      pastDueCount,
      expiringSoonCount,
      freeTierCount,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.subscriptionPlan.count({ where: { isActive: true } }),
      prisma.tenantSubscription.count({ where: { status: "ACTIVE" } }),
      prisma.tenantSubscription.count({ where: { status: "PAST_DUE" } }),
      prisma.tenantSubscription.count({
        where: {
          status: { in: ["ACTIVE", "PAST_DUE"] },
          currentPeriodEnd: { gte: now, lte: in30 },
        },
      }),
      prisma.tenantSubscription.count({
        where: { status: "ACTIVE", plan: { isFreeTier: true } },
      }),
    ]);

    return {
      data: {
        tenantCount,
        planCount,
        activeSubscriptions,
        pastDueCount,
        expiringSoonCount,
        freeTierCount,
      },
    };
  });

  app.get("/plans", async (request) => {
    requirePlatformAdmin(request);
    const q = z
      .object({ includeInactive: z.coerce.boolean().optional() })
      .parse(request.query);

    const rows = await prisma.subscriptionPlan.findMany({
      where: q.includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return { data: rows.map(serializePlan) };
  });

  app.post("/plans", async (request) => {
    requirePlatformAdmin(request);
    const body = parseBody(planBodySchema, request.body);
    const existing = await prisma.subscriptionPlan.findUnique({ where: { slug: body.slug } });
    if (existing) {
      throw new AppError(409, "Conflict", "A plan with this slug already exists.");
    }

    const created = await prisma.subscriptionPlan.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        billingInterval: body.billingInterval ?? null,
        priceAmount: body.priceAmount,
        currencyCode: body.currencyCode ?? "USD",
        isFreeTier: body.isFreeTier ?? false,
        trialDays: body.trialDays ?? 0,
        features: body.features as unknown as Prisma.InputJsonValue,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
      include: { _count: { select: { subscriptions: true } } },
    });
    return { data: serializePlan(created) };
  });

  app.patch("/plans/:id", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(planBodySchema.partial(), request.body);

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: p.id } });
    if (!existing) throw new AppError(404, "Not found", "Plan not found.");

    if (body.slug && body.slug !== existing.slug) {
      const clash = await prisma.subscriptionPlan.findUnique({ where: { slug: body.slug } });
      if (clash) throw new AppError(409, "Conflict", "Slug already in use.");
    }

    const updated = await prisma.subscriptionPlan.update({
      where: { id: p.id },
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        billingInterval: body.billingInterval,
        priceAmount: body.priceAmount,
        currencyCode: body.currencyCode,
        isFreeTier: body.isFreeTier,
        trialDays: body.trialDays,
        features: body.features as unknown as Prisma.InputJsonValue | undefined,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      },
      include: { _count: { select: { subscriptions: true } } },
    });
    return { data: serializePlan(updated) };
  });

  app.delete("/plans/:id", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id: p.id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!existing) throw new AppError(404, "Not found", "Plan not found.");

    const activeSubs = await prisma.tenantSubscription.count({
      where: { planId: p.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
    });
    if (activeSubs > 0) {
      throw new AppError(
        409,
        "Conflict",
        "Cannot delete a plan with active subscriptions. Deactivate it instead.",
      );
    }

    await prisma.subscriptionPlan.update({
      where: { id: p.id },
      data: { isActive: false },
    });
    return { data: { id: p.id, deactivated: true } };
  });

  app.get("/tenants", async (request) => {
    requirePlatformAdmin(request);
    const q = z
      .object({
        search: z.string().max(100).optional(),
        take: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(request.query);

    const where: Prisma.TenantWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { slug: { contains: s, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.take ?? 200,
      include: {
        _count: { select: { users: true, products: true } },
        tenantSubscriptions: {
          orderBy: { currentPeriodEnd: "desc" },
          take: 1,
          include: { plan: true },
        },
      },
    });

    const data = rows.map((t) => {
      const sub = t.tenantSubscriptions[0];
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        timezone: t.timezone,
        baseCurrencyCode: t.baseCurrencyCode,
        createdAt: t.createdAt.toISOString(),
        userCount: t._count.users,
        productCount: t._count.products,
        subscription: sub
          ? {
              id: sub.id,
              status: sub.status,
              currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
              planName: sub.plan.name,
              planSlug: sub.plan.slug,
            }
          : null,
      };
    });

    return { data };
  });

  app.get("/tenants/:id", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);

    const tenant = await prisma.tenant.findUnique({
      where: { id: p.id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        tenantSubscriptions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { plan: true },
        },
        _count: { select: { products: true, warehouses: true, sales: true } },
      },
    });
    if (!tenant) throw new AppError(404, "Not found", "Tenant not found.");

    return {
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        timezone: tenant.timezone,
        baseCurrencyCode: tenant.baseCurrencyCode,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
        counts: {
          products: tenant._count.products,
          warehouses: tenant._count.warehouses,
          sales: tenant._count.sales,
        },
        users: tenant.users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt.toISOString(),
        })),
        subscriptions: tenant.tenantSubscriptions.map((s) =>
          serializeSubscription({
            ...s,
            tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          }),
        ),
      },
    };
  });

  app.patch("/tenants/:id", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        name: z.string().min(2).max(200).optional(),
        timezone: z.string().min(1).max(64).optional(),
        baseCurrencyCode: z.string().length(3).optional(),
      }),
      request.body,
    );

    const updated = await prisma.tenant.update({
      where: { id: p.id },
      data: body,
    });
    return {
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        timezone: updated.timezone,
        baseCurrencyCode: updated.baseCurrencyCode,
      },
    };
  });

  app.post("/tenants/:id/assign-plan", async (request) => {
    const admin = requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(z.object({ planSlug: z.string().min(1) }), request.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: p.id } });
    if (!tenant) throw new AppError(404, "Not found", "Tenant not found.");

    const owner = await prisma.user.findFirst({
      where: { tenantId: p.id, role: "OWNER", isActive: true },
    });
    if (!owner) {
      throw new AppError(400, "No owner", "Tenant has no active owner user to attribute billing.");
    }

    const sub = await changePlanForTenant({
      tenantId: p.id,
      planSlug: body.planSlug,
      userId: owner.id,
    });

    const full = await prisma.tenantSubscription.findUniqueOrThrow({
      where: { id: sub.id },
      include: { tenant: true, plan: true },
    });

    await prisma.subscriptionReminder.create({
      data: {
        tenantSubscriptionId: full.id,
        channel: "IN_APP",
        templateKey: "ADMIN_PLAN_ASSIGNED",
        message: `Plan changed to ${full.plan.name} by platform operator ${admin.email}`,
        createdByPlatformAdminId: admin.id,
      },
    });

    return { data: serializeSubscription(full) };
  });

  app.get("/subscriptions", async (request) => {
    requirePlatformAdmin(request);
    const q = z
      .object({
        status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
        expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
        tenantId: z.string().uuid().optional(),
      })
      .parse(request.query);

    const where: Prisma.TenantSubscriptionWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.tenantId) where.tenantId = q.tenantId;
    if (q.expiringWithinDays != null) {
      const now = new Date();
      const until = new Date();
      until.setUTCDate(until.getUTCDate() + q.expiringWithinDays);
      where.currentPeriodEnd = { gte: now, lte: until };
    }

    const rows = await prisma.tenantSubscription.findMany({
      where,
      include: { tenant: true, plan: true },
      orderBy: { currentPeriodEnd: "asc" },
      take: 500,
    });

    return { data: rows.map(serializeSubscription) };
  });

  app.get("/subscriptions/:id", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);

    const sub = await prisma.tenantSubscription.findUnique({
      where: { id: p.id },
      include: {
        tenant: true,
        plan: true,
        reminders: { orderBy: { sentAt: "desc" }, take: 20 },
      },
    });
    if (!sub) throw new AppError(404, "Not found", "Subscription not found.");

    return {
      data: {
        ...serializeSubscription(sub),
        reminders: sub.reminders.map((r) => ({
          id: r.id,
          channel: r.channel,
          templateKey: r.templateKey,
          message: r.message,
          sentAt: r.sentAt.toISOString(),
        })),
      },
    };
  });

  app.patch("/subscriptions/:id", async (request) => {
    const admin = requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
        currentPeriodEnd: z.string().datetime().optional(),
        planSlug: z.string().min(1).optional(),
        cancelAtPeriodEnd: z.boolean().optional(),
      }),
      request.body,
    );

    const existing = await prisma.tenantSubscription.findFirst({
      where: { id: p.id },
      include: { plan: true },
    });
    if (!existing) {
      throw new AppError(404, "Not found", "Subscription not found.");
    }

    let planId = existing.planId;
    if (body.planSlug) {
      const plan = await prisma.subscriptionPlan.findFirst({
        where: { slug: body.planSlug, isActive: true },
      });
      if (!plan) throw new AppError(404, "Not found", "Plan not found.");
      planId = plan.id;
    }

    const updated = await prisma.tenantSubscription.update({
      where: { id: existing.id },
      data: {
        status: (body.status ?? existing.status) as SubscriptionStatus,
        currentPeriodEnd: body.currentPeriodEnd
          ? new Date(body.currentPeriodEnd)
          : existing.currentPeriodEnd,
        cancelAtPeriodEnd: body.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
        planId,
      },
      include: { plan: true, tenant: true },
    });

    await prisma.subscriptionReminder.create({
      data: {
        tenantSubscriptionId: updated.id,
        channel: "IN_APP",
        templateKey: "ADMIN_SUBSCRIPTION_UPDATE",
        message: `Subscription updated by platform operator ${admin.email}`,
        metadata: { adminId: admin.id, patch: body } as Prisma.InputJsonValue,
        createdByPlatformAdminId: admin.id,
      },
    });

    return { data: serializeSubscription(updated) };
  });

  app.post("/subscriptions/:id/extend-period", async (request) => {
    const admin = requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        billingInterval: z.enum(["MONTHLY", "ANNUAL"]).nullable(),
        isFreeTier: z.boolean().optional(),
      }),
      request.body,
    );

    const existing = await prisma.tenantSubscription.findFirst({
      where: { id: p.id },
      include: { plan: true },
    });
    if (!existing) {
      throw new AppError(404, "Not found", "Subscription not found.");
    }

    const anchor = existing.currentPeriodEnd > new Date() ? existing.currentPeriodEnd : new Date();
    const useFree = body.isFreeTier ?? existing.plan.isFreeTier;
    const interval = body.billingInterval ?? existing.plan.billingInterval;
    const nextEnd = addBillingPeriod(anchor, interval, useFree);

    const updated = await prisma.tenantSubscription.update({
      where: { id: existing.id },
      data: {
        currentPeriodEnd: nextEnd,
        status: "ACTIVE",
      },
      include: { plan: true, tenant: true },
    });

    await prisma.subscriptionReminder.create({
      data: {
        tenantSubscriptionId: updated.id,
        channel: "IN_APP",
        templateKey: "ADMIN_PERIOD_EXTENDED",
        message: `Billing period extended by ${admin.email} until ${nextEnd.toISOString()}`,
        createdByPlatformAdminId: admin.id,
      },
    });

    return { data: serializeSubscription(updated) };
  });

  app.post("/subscriptions/:id/reminders", async (request) => {
    const admin = requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        channel: z.enum(["EMAIL", "IN_APP"]).default("EMAIL"),
        templateKey: z.string().min(1).default("RENEWAL_DUE"),
        message: z.string().min(1),
      }),
      request.body,
    );

    const sub = await findSubscriptionById(p.id);
    if (!sub) {
      throw new AppError(404, "Not found", "Subscription not found.");
    }

    const reminder = await prisma.subscriptionReminder.create({
      data: {
        tenantSubscriptionId: sub.id,
        channel: body.channel,
        templateKey: body.templateKey,
        message: body.message,
        metadata: {
          tenantSlug: sub.tenant.slug,
          planName: sub.plan.name,
          periodEnd: sub.currentPeriodEnd.toISOString(),
        } as Prisma.InputJsonValue,
        createdByPlatformAdminId: admin.id,
      },
    });

    return {
      data: {
        id: reminder.id,
        sentAt: reminder.sentAt.toISOString(),
        note:
          body.channel === "EMAIL"
            ? "Reminder logged. Connect an email provider to deliver messages in production."
            : "In-app reminder recorded.",
      },
    };
  });
};

async function findSubscriptionById(id: string) {
  return prisma.tenantSubscription.findUnique({
    where: { id },
    include: { tenant: true, plan: true },
  });
}
