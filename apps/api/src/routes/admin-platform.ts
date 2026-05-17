import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { toCsv } from "../lib/csv.js";
import { AppError } from "../lib/problem.js";
import { requirePlatformAdmin } from "../middleware/platform-admin.js";
import { emailConfigured, sendPlatformEmail } from "../services/email.js";
import { signupTenantUser } from "../services/auth.js";

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

export const adminPlatformRoutes: FastifyPluginAsync = async (app) => {
  registerTenantCrud(app);
  registerUserCrud(app);
  registerAuditAndExport(app);
  registerEmailSettings(app);
};

function registerTenantCrud(app: FastifyInstance): void {
  app.post("/tenants", async (request) => {
    requirePlatformAdmin(request);
    const body = parseBody(
      z.object({
        organizationName: z.string().min(2).max(200),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(80)
          .optional(),
        timezone: z.string().min(1).max(64).optional(),
        baseCurrencyCode: z.string().length(3).optional(),
        planSlug: z.string().min(1),
        ownerEmail: z.string().email(),
        ownerPassword: z.string().min(10),
        ownerDisplayName: z.string().min(1).max(120).optional(),
      }),
      request.body,
    );

    if (body.slug) {
      const taken = await prisma.tenant.findUnique({ where: { slug: body.slug } });
      if (taken) throw new AppError(409, "Conflict", "Tenant slug already exists.");
    }

    const identity = await signupTenantUser({
      organizationName: body.organizationName,
      email: body.ownerEmail,
      password: body.ownerPassword,
      planSlug: body.planSlug,
      displayName: body.ownerDisplayName,
    });

    if (body.slug || body.timezone || body.baseCurrencyCode) {
      await prisma.tenant.update({
        where: { id: identity.tenantId },
        data: {
          ...(body.slug ? { slug: body.slug } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
          ...(body.baseCurrencyCode ? { baseCurrencyCode: body.baseCurrencyCode } : {}),
        },
      });
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: identity.tenantId } });
    return {
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        timezone: tenant.timezone,
        baseCurrencyCode: tenant.baseCurrencyCode,
        isSuspended: tenant.isSuspended,
        owner: identity,
      },
    };
  });

  app.delete("/tenants/:id", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({ confirmSlug: z.string().min(1) }),
      request.body ?? {},
    );

    const tenant = await prisma.tenant.findUnique({ where: { id: p.id } });
    if (!tenant) throw new AppError(404, "Not found", "Tenant not found.");
    if (tenant.slug !== body.confirmSlug.trim()) {
      throw new AppError(400, "Confirmation failed", "Slug does not match. Tenant was not deleted.");
    }

    await prisma.tenant.delete({ where: { id: p.id } });
    return { data: { id: p.id, deleted: true } };
  });
}

function registerUserCrud(app: FastifyInstance): void {
  app.get("/tenants/:tenantId/users", async (request) => {
    requirePlatformAdmin(request);
    const p = z
      .object({ tenantId: z.string().uuid() })
      .parse(request.params);

    const users = await prisma.user.findMany({
      where: { tenantId: p.tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      data: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
    };
  });

  app.post("/tenants/:tenantId/users", async (request) => {
    requirePlatformAdmin(request);
    const p = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        email: z.string().email(),
        password: z.string().min(10),
        displayName: z.string().min(1).max(120),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
      }),
      request.body,
    );

    const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
    if (!tenant) throw new AppError(404, "Not found", "Tenant not found.");

    const existing = await prisma.user.findFirst({
      where: { tenantId: p.tenantId, email: body.email.toLowerCase().trim() },
    });
    if (existing) throw new AppError(409, "Conflict", "Email already exists for this tenant.");

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        tenantId: p.tenantId,
        email: body.email.toLowerCase().trim(),
        displayName: body.displayName.trim(),
        passwordHash,
        role: body.role,
      },
    });

    return {
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
      },
    };
  });

  app.patch("/tenants/:tenantId/users/:userId", async (request) => {
    requirePlatformAdmin(request);
    const p = z
      .object({ tenantId: z.string().uuid(), userId: z.string().uuid() })
      .parse(request.params);
    const body = parseBody(
      z.object({
        displayName: z.string().min(1).max(120).optional(),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(10).optional(),
      }),
      request.body,
    );

    const existing = await prisma.user.findFirst({
      where: { id: p.userId, tenantId: p.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "User not found.");

    if (body.role === "OWNER" && body.role !== existing.role) {
      const owners = await prisma.user.count({
        where: { tenantId: p.tenantId, role: "OWNER", isActive: true, id: { not: p.userId } },
      });
      if (owners === 0 && body.isActive !== false) {
        // ok to promote when no other owner
      }
    }

    const updated = await prisma.user.update({
      where: { id: p.userId },
      data: {
        displayName: body.displayName,
        role: body.role,
        isActive: body.isActive,
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 12) } : {}),
      },
    });

    return {
      data: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role,
        isActive: updated.isActive,
      },
    };
  });

  app.delete("/tenants/:tenantId/users/:userId", async (request) => {
    requirePlatformAdmin(request);
    const p = z
      .object({ tenantId: z.string().uuid(), userId: z.string().uuid() })
      .parse(request.params);

    const existing = await prisma.user.findFirst({
      where: { id: p.userId, tenantId: p.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "User not found.");

    const updated = await prisma.user.update({
      where: { id: p.userId },
      data: { isActive: false },
    });

    return { data: { id: updated.id, deactivated: true } };
  });
}

function registerAuditAndExport(app: FastifyInstance): void {
  app.get("/audit-logs", async (request) => {
    requirePlatformAdmin(request);
    const q = z
      .object({
        tenantId: z.string().uuid().optional(),
        take: z.coerce.number().int().min(1).max(200).optional(),
      })
      .parse(request.query);

    const take = q.take ?? 100;

    const [auditRows, reminderRows] = await Promise.all([
      prisma.auditLog.findMany({
        where: q.tenantId ? { tenantId: q.tenantId } : undefined,
        orderBy: { timestamp: "desc" },
        take,
        include: {
          tenant: { select: { slug: true, name: true } },
          user: { select: { email: true, displayName: true } },
        },
      }),
      prisma.subscriptionReminder.findMany({
        where: q.tenantId
          ? { tenantSubscription: { tenantId: q.tenantId } }
          : undefined,
        orderBy: { sentAt: "desc" },
        take,
        include: {
          tenantSubscription: {
            include: { tenant: { select: { slug: true, name: true } } },
          },
        },
      }),
    ]);

    const auditEvents = auditRows.map((a) => ({
      id: a.id,
      source: "tenant_audit" as const,
      at: a.timestamp.toISOString(),
      tenantSlug: a.tenant.slug,
      tenantName: a.tenant.name,
      actor: a.user.displayName,
      actorEmail: a.user.email,
      action: a.action,
      summary: `${a.action} on ${a.entityName}`,
      entityName: a.entityName,
      entityId: a.entityId,
    }));

    const reminderEvents = reminderRows.map((r) => ({
      id: r.id,
      source: "platform_reminder" as const,
      at: r.sentAt.toISOString(),
      tenantSlug: r.tenantSubscription.tenant.slug,
      tenantName: r.tenantSubscription.tenant.name,
      actor: r.createdByPlatformAdminId ? "Platform operator" : "System",
      actorEmail: "",
      action: r.templateKey,
      summary: r.message ?? r.templateKey,
      entityName: "TenantSubscription",
      entityId: r.tenantSubscriptionId,
      channel: r.channel,
    }));

    const merged = [...auditEvents, ...reminderEvents]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, take);

    return { data: merged };
  });

  app.get("/export/tenants", async (request, reply) => {
    requirePlatformAdmin(request);
    const rows = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        _count: { select: { users: true } },
        tenantSubscriptions: {
          orderBy: { currentPeriodEnd: "desc" },
          take: 1,
          include: { plan: true },
        },
      },
    });

    const csv = toCsv(
      ["name", "slug", "timezone", "currency", "suspended", "users", "plan", "status", "period_end"],
      rows.map((t) => {
        const sub = t.tenantSubscriptions[0];
        return [
          t.name,
          t.slug,
          t.timezone,
          t.baseCurrencyCode,
          t.isSuspended,
          t._count.users,
          sub?.plan.name ?? "",
          sub?.status ?? "",
          sub?.currentPeriodEnd.toISOString() ?? "",
        ];
      }),
    );

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="tenants.csv"');
    return reply.send(csv);
  });

  app.get("/export/subscriptions", async (request, reply) => {
    requirePlatformAdmin(request);
    const rows = await prisma.tenantSubscription.findMany({
      include: { tenant: true, plan: true },
      orderBy: { currentPeriodEnd: "asc" },
      take: 5000,
    });

    const csv = toCsv(
      ["tenant", "slug", "plan", "status", "period_end", "started_at"],
      rows.map((s) => [
        s.tenant.name,
        s.tenant.slug,
        s.plan.name,
        s.status,
        s.currentPeriodEnd.toISOString(),
        s.startedAt.toISOString(),
      ]),
    );

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="subscriptions.csv"');
    return reply.send(csv);
  });

  app.get("/export/plans", async (request, reply) => {
    requirePlatformAdmin(request);
    const rows = await prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    });

    const csv = toCsv(
      ["name", "slug", "price", "currency", "interval", "free_tier", "active", "subscriptions"],
      rows.map((p) => [
        p.name,
        p.slug,
        p.priceAmount.toString(),
        p.currencyCode,
        p.billingInterval ?? "",
        p.isFreeTier,
        p.isActive,
        p._count.subscriptions,
      ]),
    );

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="plans.csv"');
    return reply.send(csv);
  });
}

function registerEmailSettings(app: FastifyInstance): void {
  app.get("/settings/email", async (request) => {
    requirePlatformAdmin(request);
    return {
      data: {
        configured: emailConfigured(),
        from: process.env.PLATFORM_EMAIL_FROM ?? null,
        provider: emailConfigured() ? "resend" : null,
      },
    };
  });

  app.post("/settings/email/test", async (request) => {
    requirePlatformAdmin(request);
    const body = parseBody(
      z.object({
        to: z.string().email(),
        subject: z.string().min(1).max(200).optional(),
      }),
      request.body,
    );

    const result = await sendPlatformEmail({
      to: body.to,
      subject: body.subject ?? "ERP Platform test email",
      text: "This is a test message from your ERP platform operator console.",
    });

    if (!result.sent) {
      throw new AppError(
        502,
        "Email not sent",
        result.error ?? "Configure RESEND_API_KEY and PLATFORM_EMAIL_FROM.",
      );
    }

    return { data: result };
  });
}
