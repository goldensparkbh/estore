import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface TenantResponse {
  data: { id: string; name: string; timezone: string; baseCurrencyCode: string } | null;
}

interface SubResponse {
  data: {
    plan: { name: string; slug: string; isFreeTier: boolean };
    currentPeriodEnd: string;
    status: string;
  } | null;
}

export function DashboardPage(): ReactElement {
  const tenant = useQuery({
    queryKey: ["tenant"],
    queryFn: () => apiFetch<TenantResponse>("/v1/reference/tenant"),
  });

  const sub = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiFetch<SubResponse>("/v1/billing/subscription"),
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4 md:col-span-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Tenant</p>
        {tenant.isLoading && <p className="mt-2 text-sm">Loading…</p>}
        {tenant.data?.data && (
          <div className="mt-2 space-y-1">
            <p className="text-lg font-semibold">{tenant.data.data.name}</p>
            <p className="text-sm text-muted-foreground">
              Base currency {tenant.data.data.baseCurrencyCode} · TZ {tenant.data.data.timezone}
            </p>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Subscription</p>
        {sub.isLoading && <p className="mt-2 text-sm">Loading…</p>}
        {sub.data?.data === null && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            No active plan.{" "}
            <Link to="/app/billing" className="underline">
              Open billing
            </Link>
          </p>
        )}
        {sub.data?.data && (
          <div className="mt-2 space-y-1 text-sm">
            <p className="font-medium">{sub.data.data.plan.name}</p>
            <p className="text-muted-foreground">
              {sub.data.data.plan.isFreeTier ? "Free tier" : "Paid"} · {sub.data.data.status}
            </p>
            <p className="text-xs text-muted-foreground">
              Period end {new Date(sub.data.data.currentPeriodEnd).toLocaleDateString()}
            </p>
            <Link
              to="/app/billing"
              className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Manage billing
            </Link>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground md:col-span-3">
        Three-click navigation: open the command palette (<kbd className="rounded border px-1">Ctrl K</kbd>
        ), pick a module, land on work. Modules you have not paid for return a clear upgrade path.
      </div>
    </div>
  );
}
