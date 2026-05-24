import type { ReactElement } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface MarketplaceOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerEmail: string;
  currencyCode: string;
  grossAmount: string;
  tapFeeAmount: string;
  platformCommissionAmount: string;
  tenantNetAmount: string;
  commissionRateApplied: string;
  tapChargeId: string | null;
  tapChargeStatus: string | null;
  saleId: string | null;
  events?: Array<{
    status: string;
    tapEvent: string | null;
    note: string | null;
    createdAt: string;
  }>;
  lines?: Array<{
    sku: string;
    name: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  createdAt: string;
  capturedAt: string | null;
  refundedAt: string | null;
}

const STATUSES = [
  "",
  "PENDING",
  "INITIATED",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

function statusClass(status: string): string {
  if (status === "CAPTURED") return "text-emerald-400";
  if (["PENDING", "INITIATED", "AUTHORIZED"].includes(status)) return "text-amber-400";
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) return "text-orange-400";
  if (["FAILED", "CANCELLED"].includes(status)) return "text-red-400";
  return "text-muted-foreground";
}

export function MarketplaceTransactionsPage(): ReactElement {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["marketplace-orders", statusFilter],
    queryFn: () =>
      apiFetch<{ data: MarketplaceOrder[] }>("/v1/marketplace/orders", {
        query: statusFilter ? { status: statusFilter } : {},
      }),
  });

  const detail = useQuery({
    queryKey: ["marketplace-order", selectedId],
    queryFn: () =>
      apiFetch<{ data: MarketplaceOrder }>(`/v1/marketplace/orders/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const sync = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: MarketplaceOrder }>(`/v1/marketplace/orders/${id}/sync`, {
        method: "POST",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["marketplace-orders"] });
      void qc.invalidateQueries({ queryKey: ["marketplace-order", selectedId] });
    },
  });

  const selected = detail.data?.data ?? orders.data?.data.find((o) => o.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Online store</p>
        <h1 className="text-xl font-semibold">Marketplace transactions</h1>
        <p className="text-sm text-muted-foreground">
          TAP payments from your online store — status, fees, and commission splits per order.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
        <Button
          variant="subtle"
          size="sm"
          type="button"
          onClick={() => void qc.invalidateQueries({ queryKey: ["marketplace-orders"] })}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-3">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Gross</th>
                <th className="px-4 py-2 text-right">You receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {(orders.data?.data ?? []).map((o) => (
                <tr
                  key={o.id}
                  className={`cursor-pointer transition hover:bg-muted/30 ${selectedId === o.id ? "bg-muted/40" : ""}`}
                  onClick={() => setSelectedId(o.id)}
                >
                  <td className="px-4 py-2">
                    <p className="font-mono text-xs">{o.orderNumber}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <p>{o.customerName}</p>
                    <p className="text-[10px] text-muted-foreground">{o.customerEmail}</p>
                  </td>
                  <td className={`px-4 py-2 font-mono text-xs ${statusClass(o.status)}`}>
                    {o.status}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {o.currencyCode} {Number(o.grossAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-medium">
                    {o.currencyCode} {Number(o.tenantNetAmount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {!orders.isLoading && (orders.data?.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No marketplace orders yet. Enable your store and connect TAP in Account settings.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          {!selected ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Select an order to view the full split and status timeline.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{selected.orderNumber}</p>
                  <p className={`font-semibold ${statusClass(selected.status)}`}>{selected.status}</p>
                </div>
                {selected.tapChargeId && (
                  <Button
                    variant="subtle"
                    size="sm"
                    type="button"
                    disabled={sync.isPending}
                    onClick={() => sync.mutate(selected.id)}
                  >
                    Sync TAP
                  </Button>
                )}
              </div>

              <dl className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <SplitRow label="Gross" value={`${selected.currencyCode} ${fmt(selected.grossAmount)}`} />
                <SplitRow
                  label="TAP fee (est.)"
                  value={`− ${selected.currencyCode} ${fmt(selected.tapFeeAmount)}`}
                />
                <SplitRow
                  label="Golden Spark commission"
                  value={`− ${selected.currencyCode} ${fmt(selected.platformCommissionAmount)}`}
                />
                <SplitRow
                  label="Your net"
                  value={`${selected.currencyCode} ${fmt(selected.tenantNetAmount)}`}
                  strong
                />
              </dl>

              {selected.lines && selected.lines.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {selected.lines.map((l) => (
                    <li key={l.sku} className="flex justify-between gap-2">
                      <span>
                        {l.name} × {l.quantity}
                      </span>
                      <span className="font-mono">{fmt(l.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {selected.events && selected.events.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Timeline</p>
                  <ul className="space-y-2 text-xs">
                    {selected.events.map((ev, i) => (
                      <li key={`${ev.createdAt}-${i}`}>
                        <span className="text-muted-foreground">
                          {new Date(ev.createdAt).toLocaleString()}
                        </span>
                        <span className="ml-2 font-mono">{ev.status}</span>
                        {ev.note && <span className="text-muted-foreground"> — {ev.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.saleId && (
                <p className="text-xs text-muted-foreground">
                  Fulfilled as POS sale · ID <span className="font-mono">{selected.saleId.slice(0, 8)}…</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SplitRow(props: { label: string; value: string; strong?: boolean }): ReactElement {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className={props.strong ? "font-semibold" : undefined}>{props.value}</dd>
    </div>
  );
}

function fmt(n: string): string {
  return Number(n).toFixed(2);
}
