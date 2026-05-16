import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "../middleware/tenant.js";
import {
  changePlanForTenant,
  getCurrentSubscription,
  parsePlanFeatures,
} from "../services/billing.js";
import { authenticateTenantOwnerForBilling } from "../services/auth.js";

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

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/subscription", async (request) => {
    const ctx = requireCtx(request);
    const sub = await getCurrentSubscription(ctx.tenantId);
    if (!sub) {
      return { data: null };
    }
    return {
      data: {
        id: sub.id,
        status: sub.status,
        startedAt: sub.startedAt.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        plan: {
          id: sub.plan.id,
          name: sub.plan.name,
          slug: sub.plan.slug,
          description: sub.plan.description,
          billingInterval: sub.plan.billingInterval,
          priceAmount: sub.plan.priceAmount.toString(),
          currencyCode: sub.plan.currencyCode,
          isFreeTier: sub.plan.isFreeTier,
          features: parsePlanFeatures(sub.plan.features),
        },
      },
    };
  });

  app.post("/subscribe", async (request) => {
    const ctx = requireCtx(request);
    await authenticateTenantOwnerForBilling(ctx.tenantId, ctx.userId);
    const body = parseBody(z.object({ planSlug: z.string().min(1) }), request.body);
    const sub = await changePlanForTenant({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      planSlug: body.planSlug,
    });
    return {
      data: {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        planSlug: sub.plan.slug,
      },
    };
  });

  app.get("/plans", async (request) => {
    requireCtx(request);
    const rows = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const data = rows.map((p) => ({
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
      sortOrder: p.sortOrder,
    }));
    return { data };
  });
};
