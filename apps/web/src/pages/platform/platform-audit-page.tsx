import type { ReactElement } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import { PageHeader } from "@/components/platform/page-header";
import { inputClass, labelClass } from "@/lib/platform-types";

interface AuditRow {
  id: string;
  source: "tenant_audit" | "platform_reminder";
  at: string;
  tenantSlug: string;
  tenantName: string;
  actor: string;
  action: string;
  summary: string;
  channel?: string;
}

export function PlatformAuditPage(): ReactElement {
  const [tenantId, setTenantId] = useState("");

  const q = useQuery({
    queryKey: ["admin-audit", tenantId],
    queryFn: () => {
      const qs = tenantId ? `?tenantId=${tenantId}` : "";
      return adminApiFetch<{ data: AuditRow[] }>(`/v1/admin/audit-logs${qs}`);
    },
  });

  return (
    <>
      <section className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Activity log"
          description="Tenant audit events and platform reminders in one timeline."
        />

        <label className="block max-w-md text-sm">
          <span className={labelClass}>Filter by tenant ID (optional)</span>
          <input
            className={inputClass}
            placeholder="UUID"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          />
        </label>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {q.isError && <p className="p-4 text-sm text-red-400">{(q.error as Error).message}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Summary</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.data ?? []).map((r) => (
                  <tr key={`${r.source}-${r.id}`} className="border-b border-border/60">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.tenantName}</span>
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {r.tenantSlug}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.source === "tenant_audit"
                        ? "Tenant"
                        : `Reminder${r.channel ? ` (${r.channel})` : ""}`}
                    </td>
                    <td className="px-4 py-3">{r.actor}</td>
                    <td className="px-4 py-3">{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(q.data?.data.length ?? 0) === 0 && !q.isLoading && (
            <p className="p-6 text-center text-sm text-muted-foreground">No activity yet.</p>
          )}
        </section>
      </section>
    </>
  );
}
