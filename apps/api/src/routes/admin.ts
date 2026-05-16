import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requirePlatformAdmin } from "../middleware/platform-admin.js";
import { addBillingPeriod, parsePlanFeatures } from "../services/billing.js";

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

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/subscriptions", async (request) => {
    requirePlatformAdmin(request);
    const q = z
      .object({
        status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
        expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
      })
      .parse(request.query);

    const where: Prisma.TenantSubscriptionWhereInput = {};
    if (q.status) where.status = q.status;
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

    const data = rows.map((s) => ({
      id: s.id,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      currentPeriodEnd: s.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      tenant: {
        id: s.tenant.id,
        name: s.tenant.name,
        slug: s.tenant.slug,
      },
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
    }));

    return { data };
  });

  app.patch("/subscriptions/:id", async (request) => {
    const admin = requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
        currentPeriodEnd: z.string().datetime().optional(),
        planSlug: z.string().min(1).optional(),
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

    return {
      data: {
        id: updated.id,
        status: updated.status,
        currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
        planSlug: updated.plan.slug,
      },
    };
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

    return { data: { id: updated.id, currentPeriodEnd: updated.currentPeriodEnd.toISOString() } };
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
            ? "Reminder logged. Connect an email provider (e.g. transactional API) to deliver messages in production."
            : "In-app reminder recorded for audit and future notification UI.",
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
