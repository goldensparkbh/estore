import type {
  BillingInterval,
  SubscriptionPlan,
  SubscriptionStatus,
  TenantSubscription,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";

export interface PlanFeatures {
  modules: {
    inventory: boolean;
    pos: boolean;
    hr: boolean;
  };
  maxWarehouses?: number;
  maxProducts?: number;
  maxUsers?: number;
}

export function parsePlanFeatures(raw: unknown): PlanFeatures {
  if (!raw || typeof raw !== "object") {
    return {
      modules: { inventory: false, pos: false, hr: false },
    };
  }
  const o = raw as Record<string, unknown>;
  const modules = o.modules as Record<string, unknown> | undefined;
  return {
    modules: {
      inventory: Boolean(modules?.inventory),
      pos: Boolean(modules?.pos),
      hr: Boolean(modules?.hr),
    },
    maxWarehouses: typeof o.maxWarehouses === "number" ? o.maxWarehouses : undefined,
    maxProducts: typeof o.maxProducts === "number" ? o.maxProducts : undefined,
    maxUsers: typeof o.maxUsers === "number" ? o.maxUsers : undefined,
  };
}

export function addBillingPeriod(start: Date, interval: BillingInterval | null, isFreeTier: boolean): Date {
  const end = new Date(start);
  if (isFreeTier || interval === null) {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    return end;
  }
  if (interval === "MONTHLY") {
    end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
  }
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

export async function getCurrentSubscription(
  tenantId: string,
): Promise<(TenantSubscription & { plan: SubscriptionPlan }) | null> {
  return prisma.tenantSubscription.findFirst({
    where: {
      tenantId,
      status: { in: ["ACTIVE", "PAST_DUE"] },
    },
    include: { plan: true },
    orderBy: { currentPeriodEnd: "desc" },
  });
}

export function isSubscriptionUsable(sub: TenantSubscription): boolean {
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") return false;
  return sub.currentPeriodEnd.getTime() >= Date.now();
}

export function requestPathToModule(pathname: string): keyof PlanFeatures["modules"] | null {
  if (pathname.startsWith("/v1/inventory")) return "inventory";
  if (pathname.startsWith("/v1/pos")) return "pos";
  if (pathname.startsWith("/v1/hr")) return "hr";
  return null;
}

function pathRequiresPaidProductAccess(pathname: string): boolean {
  return (
    pathname.startsWith("/v1/inventory") ||
    pathname.startsWith("/v1/pos") ||
    pathname.startsWith("/v1/hr") ||
    pathname.startsWith("/v1/reference")
  );
}

export function isBillingExemptPath(pathname: string): boolean {
  if (pathname.startsWith("/v1/billing")) return true;
  return false;
}

export async function assertTenantCanAccessPath(tenantId: string, pathname: string): Promise<void> {
  if (isBillingExemptPath(pathname)) return;
  if (!pathRequiresPaidProductAccess(pathname)) return;

  const sub = await getCurrentSubscription(tenantId);
  if (!sub || !isSubscriptionUsable(sub)) {
    throw new AppError(
      402,
      "Subscription required",
      "Your subscription is inactive or expired. Renew or choose a plan under Billing.",
      "https://erp.example/problems/subscription-inactive",
    );
  }

  const moduleKey = requestPathToModule(pathname);
  if (!moduleKey) return;

  const features = parsePlanFeatures(sub.plan.features);
  if (!features.modules[moduleKey]) {
    throw new AppError(
      403,
      "Plan limitation",
      "This module is not included in your current plan. Upgrade to unlock it.",
      "https://erp.example/problems/plan-module-blocked",
    );
  }
}

export async function changePlanForTenant(params: {
  tenantId: string;
  planSlug: string;
  userId: string;
}): Promise<TenantSubscription & { plan: SubscriptionPlan }> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { slug: params.planSlug, isActive: true },
  });
  if (!plan) {
    throw new AppError(404, "Plan not found", "Unknown or inactive plan slug.");
  }

  const startedAt = new Date();
  const currentPeriodEnd = addBillingPeriod(startedAt, plan.billingInterval, plan.isFreeTier);

  return prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.updateMany({
      where: { tenantId: params.tenantId, status: { in: ["ACTIVE", "PAST_DUE"] } },
      data: { status: "CANCELLED" as SubscriptionStatus, cancelAtPeriodEnd: false },
    });

    const sub = await tx.tenantSubscription.create({
      data: {
        tenantId: params.tenantId,
        planId: plan.id,
        status: "ACTIVE",
        startedAt,
        currentPeriodEnd,
      },
      include: { plan: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        action: "BILLING_PLAN_CHANGE",
        entityName: "TenantSubscription",
        entityId: sub.id,
        newValues: { planSlug: params.planSlug, periodEnd: sub.currentPeriodEnd.toISOString() },
      },
    });

    return sub;
  });
}
