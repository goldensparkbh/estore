import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { adminApiFetch } from "@/lib/admin-api";
import { usePlatformAdminStore } from "@/stores/platform-admin-store";
import { Button } from "@/components/ui/button";

interface Row {
  id: string;
  status: string;
  currentPeriodEnd: string;
  tenant: { id: string; name: string; slug: string };
  plan: { name: string; slug: string };
}

interface ListRes {
  data: Row[];
}

export function PlatformAdminPage(): ReactElement {
  const adminId = usePlatformAdminStore((s) => s.adminId);
  const displayName = usePlatformAdminStore((s) => s.displayName);
  const clear = usePlatformAdminStore((s) => s.clearOperator);

  const q = useQuery({
    queryKey: ["admin-subs", adminId],
    queryFn: () => adminApiFetch<ListRes>("/v1/admin/subscriptions"),
    enabled: Boolean(adminId),
  });

  if (!adminId) {
    return <Navigate to="/platform/login" replace />;
  }

  const sendReminder = async (id: string, tenantSlug: string): Promise<void> => {
    const message = window.prompt(
      `Reminder message for ${tenantSlug}`,
      "Your subscription renews soon. Please update billing to avoid interruption.",
    );
    if (!message) return;
    await adminApiFetch(`/v1/admin/subscriptions/${id}/reminders`, {
      method: "POST",
      body: JSON.stringify({ message, channel: "EMAIL", templateKey: "RENEWAL_DUE" }),
    });
    await q.refetch();
    window.alert("Reminder logged. Connect email delivery on the production host to notify customers.");
  };

  const extendMonthly = async (id: string): Promise<void> => {
    await adminApiFetch(`/v1/admin/subscriptions/${id}/extend-period`, {
      method: "POST",
      body: JSON.stringify({ billingInterval: "MONTHLY" }),
    });
    await q.refetch();
  };

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Platform</p>
            <h1 className="text-xl font-semibold">Customer subscriptions</h1>
            <p className="text-sm text-muted-foreground">Signed in as {displayName}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="subtle" type="button" asChild>
              <Link to="/">Marketing site</Link>
            </Button>
            <Button variant="ghost" type="button" onClick={() => clear()}>
              Sign out
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">
            All customer subscriptions (latest 500)
          </div>
          {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {q.isError && <p className="p-4 text-sm text-red-400">{(q.error as Error).message}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Tenant</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Period end</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/70">
                    <td className="px-4 py-2">
                      <span className="font-medium">{r.tenant.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {r.tenant.slug}
                      </span>
                    </td>
                    <td className="px-4 py-2">{r.plan.name}</td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(r.currentPeriodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="subtle"
                        type="button"
                        className="mr-2"
                        onClick={() => void extendMonthly(r.id)}
                      >
                        +1 mo
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => void sendReminder(r.id, r.tenant.slug)}
                      >
                        Remind
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
