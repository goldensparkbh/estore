import type { ReactElement } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";

interface SubscriptionDto {
  id: string;
  status: string;
  currentPeriodEnd: string;
  plan: {
    name: string;
    slug: string;
    isFreeTier: boolean;
    features: {
      modules: { inventory: boolean; pos: boolean; hr: boolean };
    };
  };
}

interface SubResponse {
  data: SubscriptionDto | null;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  priceAmount: string;
  currencyCode: string;
  isFreeTier: boolean;
  billingInterval: string | null;
  features: SubscriptionDto["plan"]["features"];
}

interface PlansResponse {
  data: PlanRow[];
}

export function BillingPage(): ReactElement {
  const email = useSessionStore((s) => s.email);
  const sub = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiFetch<SubResponse>("/v1/billing/subscription"),
  });

  const plans = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => apiFetch<PlansResponse>("/v1/billing/plans"),
  });

  const changePlan = useMutation({
    mutationFn: (planSlug: string) =>
      apiFetch<{ data: { planSlug: string; currentPeriodEnd: string } }>("/v1/billing/subscribe", {
        method: "POST",
        body: JSON.stringify({ planSlug }),
      }),
    onSuccess: () => void sub.refetch(),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing</p>
        <h1 className="text-xl font-semibold">Subscription & plans</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {email || "—"}. Only workspace owners can change plans.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Current subscription</h2>
        {sub.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
        {sub.isError && (
          <p className="mt-2 text-sm text-red-400">{(sub.error as Error).message}</p>
        )}
        {sub.data?.data === null && (
          <p className="mt-2 text-sm text-muted-foreground">
            No active subscription record.{" "}
            <Link to="/signup" className="text-primary underline">
              Create a workspace
            </Link>{" "}
            or contact support.
          </p>
        )}
        {sub.data?.data && (
          <div className="mt-3 space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Plan:</span> {sub.data.data.plan.name}{" "}
              {sub.data.data.plan.isFreeTier ? "(free tier)" : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Renews / ends:</span>{" "}
              {new Date(sub.data.data.currentPeriodEnd).toLocaleString()}
            </p>
            <p>
              <span className="text-muted-foreground">Modules:</span> inv{" "}
              {sub.data.data.plan.features.modules.inventory ? "✓" : "—"} · pos{" "}
              {sub.data.data.plan.features.modules.pos ? "✓" : "—"} · hr{" "}
              {sub.data.data.plan.features.modules.hr ? "✓" : "—"}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Change plan</h2>
        <p className="text-xs text-muted-foreground">
          Upgrades apply immediately with a new billing period from today (demo behaviour).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(plans.data?.data ?? []).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.isFreeTier
                    ? "Free"
                    : `${p.currencyCode} ${p.priceAmount} / ${
                        p.billingInterval === "ANNUAL" ? "yr" : "mo"
                      }`}
                </p>
              </div>
              <Button
                size="sm"
                variant="subtle"
                type="button"
                disabled={changePlan.isPending}
                onClick={() => changePlan.mutate(p.slug)}
              >
                Select
              </Button>
            </div>
          ))}
        </div>
        {changePlan.isError && (
          <p className="mt-2 text-sm text-red-400">
            {(changePlan.error as Error).message}
          </p>
        )}
        {changePlan.isSuccess && changePlan.data && (
          <p className="mt-2 text-sm text-muted-foreground">
            Plan updated to {changePlan.data.data.planSlug} until{" "}
            {new Date(changePlan.data.data.currentPeriodEnd).toLocaleString()}.
          </p>
        )}
      </div>
    </div>
  );
}
