import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { addBillingPeriod } from "../services/billing.js";
import { getStripe, stripeConfigured, webhookSecret } from "../services/stripe.js";

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

export function mapStripeStatus(s: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete_expired":
      return "EXPIRED";
    default:
      return "PAST_DUE";
  }
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
  const tenantId = sub.metadata?.tenantId;
  const planId = sub.metadata?.planId;
  if (!tenantId || !planId) {
    return;
  }

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) return;

  const periodEnd = new Date(sub.current_period_end * 1000);
  const status = mapStripeStatus(sub.status);
  const priceId = sub.items.data[0]?.price.id ?? null;

  const existing = await prisma.tenantSubscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  });

  if (existing) {
    await prisma.tenantSubscription.update({
      where: { id: existing.id },
      data: {
        status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        stripePriceId: priceId,
        planId: plan.id,
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.updateMany({
      where: { tenantId, status: { in: ["ACTIVE", "PAST_DUE"] } },
      data: { status: "CANCELLED" },
    });
    await tx.tenantSubscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status,
        startedAt: new Date(sub.start_date * 1000),
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
      },
    });
  });
}

export async function upsertInvoiceFromStripe(inv: Stripe.Invoice): Promise<void> {
  const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customerId) return;
  const tenant = await prisma.tenant.findFirst({ where: { stripeCustomerId: customerId } });
  if (!tenant) return;

  const subStripeId =
    typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;
  const sub = subStripeId
    ? await prisma.tenantSubscription.findUnique({ where: { stripeSubscriptionId: subStripeId } })
    : null;

  const data = {
    tenantId: tenant.id,
    subscriptionId: sub?.id ?? null,
    stripeInvoiceId: inv.id,
    number: inv.number ?? null,
    status: inv.status ?? "draft",
    amountDue: (inv.amount_due / 100).toFixed(4),
    amountPaid: (inv.amount_paid / 100).toFixed(4),
    currencyCode: inv.currency.toUpperCase(),
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdfUrl: inv.invoice_pdf ?? null,
    periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
    periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
    issuedAt: inv.created ? new Date(inv.created * 1000) : new Date(),
    paidAt: inv.status === "paid" && inv.status_transitions?.paid_at
      ? new Date(inv.status_transitions.paid_at * 1000)
      : null,
  };

  await prisma.invoice.upsert({
    where: { stripeInvoiceId: inv.id },
    create: data,
    update: {
      status: data.status,
      amountDue: data.amountDue,
      amountPaid: data.amountPaid,
      hostedInvoiceUrl: data.hostedInvoiceUrl,
      invoicePdfUrl: data.invoicePdfUrl,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      paidAt: data.paidAt,
      number: data.number,
    },
  });
}

export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post("/stripe", async (request, reply) => {
    if (!stripeConfigured()) {
      return reply.code(503).send({ error: "stripe-not-configured" });
    }

    const stripe = getStripe();
    const secret = webhookSecret();
    const sig = request.headers["stripe-signature"];
    const rawBody = (request as RawBodyRequest).rawBody;

    if (!secret || !sig || !rawBody) {
      request.log.warn(
        { hasSecret: Boolean(secret), hasSig: Boolean(sig), hasRaw: Boolean(rawBody) },
        "stripe webhook missing signature material",
      );
      return reply.code(400).send({ error: "missing-signature" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig as string, secret);
    } catch (err) {
      request.log.warn({ err }, "stripe webhook verification failed");
      return reply.code(400).send({ error: "invalid-signature" });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.subscription) {
            const subId =
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription.id;
            const sub = await stripe.subscriptions.retrieve(subId);
            const meta = session.metadata ?? {};
            sub.metadata = { ...sub.metadata, ...meta };
            await upsertSubscriptionFromStripe(sub);
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          await upsertSubscriptionFromStripe(sub);
          break;
        }
        case "invoice.created":
        case "invoice.finalized":
        case "invoice.paid":
        case "invoice.payment_failed":
        case "invoice.updated": {
          const inv = event.data.object as Stripe.Invoice;
          await upsertInvoiceFromStripe(inv);
          break;
        }
        default:
          request.log.info({ type: event.type }, "stripe webhook (unhandled)");
      }
    } catch (err) {
      request.log.error({ err, type: event.type }, "stripe webhook handler failed");
      return reply.code(500).send({ error: "handler-failed" });
    }

    return reply.send({ received: true });
  });
};

export { upsertSubscriptionFromStripe, addBillingPeriod };
