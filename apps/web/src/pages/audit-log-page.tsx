import type { ReactElement } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface AuditRow {
  id: string;
  action: string;
  entityName: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  timestamp: string;
  user: { id: string; displayName: string; email: string; role: string };
}

export function AuditLogPage(): ReactElement {
  const [actionFilter, setActionFilter] = useState("");

  const logs = useQuery({
    queryKey: ["audit-logs", actionFilter],
    queryFn: () =>
      apiFetch<{ data: AuditRow[] }>("/v1/audit-logs", {
        query: actionFilter ? { action: actionFilter } : {},
      }),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance</p>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="text-sm text-muted-foreground">
          Every important action in your workspace — who did what and when.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Filter by action (e.g. POS_SALE_COMPLETE)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(logs.data?.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium">{r.user.displayName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.user.role} · {r.user.email}
                  </p>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-2 text-xs">
                  {r.entityName}
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {r.entityId.slice(0, 8)}…
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                  {r.newValues ? JSON.stringify(r.newValues) : "—"}
                </td>
              </tr>
            ))}
            {logs.data?.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
