import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import { PageHeader } from "@/components/platform/page-header";
import { inputClass, labelClass } from "@/lib/platform-types";
import { Button } from "@/components/ui/button";

interface MarketplaceSettings {
  platformName: string;
  defaultCommissionRate: string;
  estimatedTapFeeRate: string;
  updatedAt: string;
}

interface MarketplaceOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  currencyCode: string;
  grossAmount: string;
  tapFeeAmount: string;
  platformCommissionAmount: string;
  tenantNetAmount: string;
  tenant?: { name: string; slug: string };
  createdAt: string;
}

function statusClass(status: string): string {
  if (status === "CAPTURED") return "text-emerald-400";
  if (["PENDING", "INITIATED", "AUTHORIZED"].includes(status)) return "text-amber-400";
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) return "text-orange-400";
  if (["FAILED", "CANCELLED"].includes(status)) return "text-red-400";
  return "text-muted-foreground";
}

export function PlatformMarketplacePage(): ReactElement {
  const qc = useQueryClient();
  const [platformName, setPlatformName] = useState("");
  const [commission, setCommission] = useState("");
  const [tapFee, setTapFee] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const settings = useQuery({
    queryKey: ["admin-marketplace-settings"],
    queryFn: () =>
      adminApiFetch<{ data: MarketplaceSettings }>("/v1/admin/marketplace/settings"),
  });

  useEffect(() => {
    if (settings.data?.data) {
      setPlatformName(settings.data.data.platformName);
      setCommission(settings.data.data.defaultCommissionRate);
      setTapFee(settings.data.data.estimatedTapFeeRate);
    }
  }, [settings.data?.data]);

  const orders = useQuery({
    queryKey: ["admin-marketplace-orders", statusFilter],
    queryFn: () =>
      adminApiFetch<{ data: MarketplaceOrder[] }>("/v1/admin/marketplace/orders", {
        query: statusFilter ? { status: statusFilter } : {},
      }),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      adminApiFetch<{ data: MarketplaceSettings }>("/v1/admin/marketplace/settings", {
        method: "PATCH",
        body: JSON.stringify({
          platformName,
          defaultCommissionRate: commission,
          estimatedTapFeeRate: tapFee,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-marketplace-settings"] }),
  });

  const onSettings = (e: FormEvent): void => {
    e.preventDefault();
    saveSettings.mutate();
  };

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Marketplace & TAP"
        description="Golden Spark commission defaults and all tenant store payments across the platform."
      />

      <form onSubmit={onSettings} className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold">Platform settings</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pn">
              Platform name
            </label>
            <input
              id="pn"
              className={inputClass}
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="cr">
              Default commission (%)
            </label>
            <input
              id="cr"
              className={inputClass}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="tf">
              Est. TAP fee (%)
            </label>
            <input
              id="tf"
              className={inputClass}
              value={tapFee}
              onChange={(e) => setTapFee(e.target.value)}
              required
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Per-tenant commission overrides can be set on each tenant record. TAP fee is estimated for
          display; actual TAP deductions come from the gateway.
        </p>
        {saveSettings.isError && (
          <p className="text-sm text-red-400">{(saveSettings.error as Error).message}</p>
        )}
        {saveSettings.isSuccess && <p className="text-sm text-emerald-400">Settings saved.</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={saveSettings.isPending}>
            Save settings
          </Button>
        </div>
      </form>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">All marketplace orders</h2>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="CAPTURED">Captured</option>
            <option value="PENDING">Pending</option>
            <option value="INITIATED">Initiated</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Tenant</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Gross</th>
                <th className="px-4 py-2 text-right">TAP (est.)</th>
                <th className="px-4 py-2 text-right">Platform</th>
                <th className="px-4 py-2 text-right">Tenant net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {(orders.data?.data ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2">
                    <p className="font-mono text-xs">{o.orderNumber}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {o.tenant?.name ?? "—"}
                    <p className="text-[10px] text-muted-foreground">{o.tenant?.slug}</p>
                  </td>
                  <td className={`px-4 py-2 font-mono text-xs ${statusClass(o.status)}`}>
                    {o.status}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {o.currencyCode} {Number(o.grossAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    − {Number(o.tapFeeAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-primary">
                    + {Number(o.platformCommissionAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {Number(o.tenantNetAmount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {!orders.isLoading && (orders.data?.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No marketplace orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
