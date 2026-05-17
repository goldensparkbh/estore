import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApiFetch } from "@/lib/admin-api";
import type { PlatformStats } from "@/lib/platform-types";
import { PageHeader } from "@/components/platform/page-header";
import { Button } from "@/components/ui/button";

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }): ReactElement {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PlatformDashboardPage(): ReactElement {
  const stats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => adminApiFetch<{ data: PlatformStats }>("/v1/admin/stats"),
  });

  const d = stats.data?.data;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Overview"
        description="Monitor tenants, subscriptions, and billing health across the platform."
      />

      {stats.isLoading && <p className="text-sm text-muted-foreground">Loading metrics…</p>}
      {stats.isError && (
        <p className="text-sm text-red-400">{(stats.error as Error).message}</p>
      )}

      {d && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Tenants" value={d.tenantCount} />
          <StatCard label="Active subscriptions" value={d.activeSubscriptions} />
          <StatCard label="Past due" value={d.pastDueCount} hint="Needs follow-up" />
          <StatCard label="Expiring in 30 days" value={d.expiringSoonCount} />
          <StatCard label="Active plans" value={d.planCount} />
          <StatCard label="Free tier subs" value={d.freeTierCount} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Quick actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage customers, adjust billing, and configure subscription plans.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" asChild>
            <Link to="/platform/tenants">View tenants</Link>
          </Button>
          <Button type="button" variant="subtle" asChild>
            <Link to="/platform/subscriptions">Subscriptions</Link>
          </Button>
          <Button type="button" variant="subtle" asChild>
            <Link to="/platform/plans">Manage plans</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
