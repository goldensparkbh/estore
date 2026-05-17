export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export interface PlanFeatures {
  modules: { inventory: boolean; pos: boolean; hr: boolean };
  maxWarehouses?: number;
  maxProducts?: number;
  maxUsers?: number;
}

export interface PlatformPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  billingInterval: string | null;
  priceAmount: string;
  currencyCode: string;
  isFreeTier: boolean;
  trialDays: number;
  features: PlanFeatures;
  isActive: boolean;
  sortOrder: number;
  subscriptionCount: number;
}

export interface PlatformStats {
  tenantCount: number;
  planCount: number;
  activeSubscriptions: number;
  pastDueCount: number;
  expiringSoonCount: number;
  freeTierCount: number;
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  baseCurrencyCode: string;
  createdAt: string;
  userCount: number;
  productCount: number;
  subscription: {
    id: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string;
    planName: string;
    planSlug: string;
  } | null;
}

export interface SubscriptionRow {
  id: string;
  status: SubscriptionStatus;
  startedAt: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  tenant: { id: string; name: string; slug: string };
  plan: {
    id: string;
    name: string;
    slug: string;
    isFreeTier: boolean;
    priceAmount: string;
    currencyCode: string;
    billingInterval: string | null;
    features: PlanFeatures;
  };
}

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
];

export const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

export const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
