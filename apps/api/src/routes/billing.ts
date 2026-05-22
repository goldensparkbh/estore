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
import { appBaseUrl, getStripe, stripeConfigured } from "../services/stripe.js";

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
        stripeSubscriptionId: sub.stripeSubscriptionId,
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

  /**
   * Subscribe directly (free tier only — paid tiers must use /checkout-session).
   * Paid plans without Stripe configured fall back to direct activation so the
   * platform stays usable for demos.
   */
  app.post("/subscribe", async (request) => {
    const ctx = requireCtx(request);
    await authenticateTenantOwnerForBilling(ctx.tenantId, ctx.userId);
    const body = parseBody(z.object({ planSlug: z.string().min(1) }), request.body);

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { slug: body.planSlug, isActive: true },
    });
    if (!plan) throw new AppError(404, "Plan not found", "Unknown or inactive plan slug.");

    if (!plan.isFreeTier && stripeConfigured()) {
      throw new AppError(
        400,
        "Use checkout",
        "Paid plans require Stripe checkout. POST /v1/billing/checkout-session instead.",
      );
    }

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

  app.post("/checkout-session", async (request) => {
    const ctx = requireCtx(request);
    await authenticateTenantOwnerForBilling(ctx.tenantId, ctx.userId);
    const body = parseBody(
      z.object({
        planSlug: z.string().min(1),
        interval: z.enum(["MONTHLY", "ANNUAL"]).optional(),
      }),
      request.body,
    );

    if (!stripeConfigured()) {
      throw new AppError(
        503,
        "Payments unavailable",
        "Stripe is not configured. Free plans still work without payment.",
      );
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { slug: body.planSlug, isActive: true },
    });
    if (!plan) throw new AppError(404, "Plan not found", "Unknown or inactive plan slug.");
    if (plan.isFreeTier) {
      throw new AppError(
        400,
        "Free plan",
        "Free plans don’t need checkout. Use /v1/billing/subscribe.",
      );
    }

    const interval = body.interval ?? (plan.billingInterval ?? "MONTHLY");
    const priceId =
      interval === "ANNUAL" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;
    if (!priceId) {
      throw new AppError(
        400,
        "Missing price",
        `Plan "${plan.slug}" has no Stripe ${interval.toLowerCase()} price configured. Ask an operator to add one.`,
      );
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const stripe = getStripe();

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: tenant.billingEmail ?? user.email,
        metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
      });
      customerId = customer.id;
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId, billingEmail: tenant.billingEmail ?? user.email },
      });
    }

    const base = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/app/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/app/billing`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          tenantId: tenant.id,
          planId: plan.id,
          planSlug: plan.slug,
          interval,
        },
      },
      metadata: {
        tenantId: tenant.id,
        planId: plan.id,
        planSlug: plan.slug,
        userId: user.id,
        interval,
      },
    });

    return { data: { url: session.url, sessionId: session.id } };
  });

  app.get("/checkout-session/:id", async (request) => {
    const ctx = requireCtx(request);
    await authenticateTenantOwnerForBilling(ctx.tenantId, ctx.userId);
    const p = z.object({ id: z.string().min(1) }).parse(request.params);

    if (!stripeConfigured()) {
      throw new AppError(503, "Payments unavailable", "Stripe is not configured.");
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(p.id);
    return {
      data: {
        status: session.status,
        paymentStatus: session.payment_status,
        customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      },
    };
  });

  app.post("/customer-portal", async (request) => {
    const ctx = requireCtx(request);
    await authenticateTenantOwnerForBilling(ctx.tenantId, ctx.userId);
    if (!stripeConfigured()) {
      throw new AppError(503, "Payments unavailable", "Stripe is not configured.");
    }
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    if (!tenant.stripeCustomerId) {
      throw new AppError(400, "No billing record", "Subscribe to a paid plan first.");
    }
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${appBaseUrl()}/app/billing`,
    });
    return { data: { url: portal.url } };
  });

  app.get("/invoices", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    return {
      data: rows.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        amountDue: i.amountDue.toString(),
        amountPaid: i.amountPaid.toString(),
        currencyCode: i.currencyCode,
        hostedInvoiceUrl: i.hostedInvoiceUrl,
        invoicePdfUrl: i.invoicePdfUrl,
        periodStart: i.periodStart?.toISOString() ?? null,
        periodEnd: i.periodEnd?.toISOString() ?? null,
        issuedAt: i.issuedAt.toISOString(),
        paidAt: i.paidAt?.toISOString() ?? null,
      })),
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
      hasMonthlyPrice: Boolean(p.stripePriceIdMonthly),
      hasAnnualPrice: Boolean(p.stripePriceIdAnnual),
    }));
    return { data };
  });
};
