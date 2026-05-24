import { describe, expect, it, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    subscriptionPlan: { findUnique: vi.fn() },
    tenantSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../lib/prisma.js";
import { mapStripeStatus, upsertSubscriptionFromStripe } from "./webhooks.js";

describe("mapStripeStatus", () => {
  it("maps active subscription statuses", () => {
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("trialing")).toBe("ACTIVE");
  });

  it("maps delinquent statuses", () => {
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeStatus("unpaid")).toBe("PAST_DUE");
  });

  it("maps cancelled and expired", () => {
    expect(mapStripeStatus("canceled")).toBe("CANCELLED");
    expect(mapStripeStatus("incomplete_expired")).toBe("EXPIRED");
  });
});

describe("upsertSubscriptionFromStripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when metadata is missing", async () => {
    const sub = {
      id: "sub_1",
      metadata: {},
      status: "active",
      current_period_end: 1_700_000_000,
      cancel_at_period_end: false,
      start_date: 1_690_000_000,
      items: { data: [{ price: { id: "price_1" } }] },
    } as unknown as Stripe.Subscription;

    await upsertSubscriptionFromStripe(sub);
    expect(prisma.subscriptionPlan.findUnique).not.toHaveBeenCalled();
  });

  it("updates existing subscription", async () => {
    vi.mocked(prisma.subscriptionPlan.findUnique).mockResolvedValue({
      id: "plan_1",
    } as never);
    vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue({
      id: "ts_1",
    } as never);
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValue({} as never);

    const sub = {
      id: "sub_stripe",
      metadata: { tenantId: "tenant_1", planId: "plan_1" },
      status: "active",
      current_period_end: 1_700_000_000,
      cancel_at_period_end: true,
      start_date: 1_690_000_000,
      items: { data: [{ price: { id: "price_monthly" } }] },
    } as unknown as Stripe.Subscription;

    await upsertSubscriptionFromStripe(sub);

    expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ts_1" },
        data: expect.objectContaining({
          status: "ACTIVE",
          cancelAtPeriodEnd: true,
          stripePriceId: "price_monthly",
        }),
      }),
    );
  });

  it("creates subscription when none exists", async () => {
    vi.mocked(prisma.subscriptionPlan.findUnique).mockResolvedValue({
      id: "plan_1",
    } as never);
    vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn({
        tenantSubscription: {
          updateMany: vi.fn(),
          create: vi.fn(),
        },
      } as never),
    );

    const sub = {
      id: "sub_new",
      metadata: { tenantId: "tenant_1", planId: "plan_1" },
      status: "active",
      current_period_end: 1_700_000_000,
      cancel_at_period_end: false,
      start_date: 1_690_000_000,
      items: { data: [{ price: { id: "price_1" } }] },
    } as unknown as Stripe.Subscription;

    await upsertSubscriptionFromStripe(sub);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
