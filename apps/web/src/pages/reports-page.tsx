import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Package, TrendingUp } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SalesAnalytics {
  data: {
    periodDays: number;
    summary: { totalSales: number; totalRevenue: string };
    daily: { day: string; total: string; count: number }[];
    topSkus: {
      productId: string;
      sku: string;
      name: string;
      imageUrl: string | null;
      quantity: string;
      revenue: string;
    }[];
    source: string;
  };
}

interface InventoryAnalytics {
  data: {
    warehouses: number;
    activeProducts: number;
    reorderRules: number;
    totalUnitsOnHand: string;
  };
}

export function ReportsPage(): ReactElement {
  const [days, setDays] = useState(30);

  const sales = useQuery({
    queryKey: ["analytics-sales", days],
    queryFn: () =>
      apiFetch<SalesAnalytics>(`/v1/analytics/sales?days=${days}`),
  });

  const inventory = useQuery({
    queryKey: ["analytics-inventory"],
    queryFn: () => apiFetch<InventoryAnalytics>("/v1/analytics/inventory"),
  });

  const maxDaily = useMemo(() => {
    const vals = (sales.data?.data.daily ?? []).map((d) => Number(d.total));
    return Math.max(...vals, 1);
  }, [sales.data?.data.daily]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Analytics</p>
        <h1 className="text-xl font-semibold">Reports & analytics</h1>
        <p className="text-sm text-muted-foreground">
          Sales trends, top products, and inventory snapshot.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground">
          Period
          <select
            className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        {sales.data?.data.source && (
          <span className="text-xs text-muted-foreground">
            Data source: {sales.data.data.source}
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Revenue"
          value={Number(sales.data?.data.summary.totalRevenue ?? 0).toFixed(2)}
          hint={`${sales.data?.data.summary.totalSales ?? 0} sales`}
        />
        <StatCard
          icon={BarChart3}
          label="Daily avg"
          value={
            sales.data?.data.daily.length
              ? (
                  Number(sales.data.data.summary.totalRevenue) /
                  sales.data.data.daily.length
                ).toFixed(2)
              : "0.00"
          }
          hint={`Last ${days} days`}
        />
        <StatCard
          icon={Package}
          label="Active products"
          value={String(inventory.data?.data.activeProducts ?? "—")}
          hint={`${inventory.data?.data.warehouses ?? 0} warehouses`}
        />
        <StatCard
          icon={Package}
          label="Units on hand"
          value={inventory.data?.data.totalUnitsOnHand ?? "—"}
          hint={`${inventory.data?.data.reorderRules ?? 0} reorder rules`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Daily sales</h2>
          <div className="mt-4 flex h-48 items-end gap-1">
            {(sales.data?.data.daily ?? []).map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                  style={{ height: `${(Number(d.total) / maxDaily) * 100}%`, minHeight: 4 }}
                  title={`${d.day}: ${d.total}`}
                />
                <span className="hidden text-[9px] text-muted-foreground sm:block">
                  {d.day.slice(5)}
                </span>
              </div>
            ))}
            {(sales.data?.data.daily ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No sales in this period.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Top SKUs</h2>
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(sales.data?.data.topSkus ?? []).map((p) => (
                  <tr key={p.productId}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted" />
                        )}
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(p.revenue).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {(sales.data?.data.topSkus ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-muted-foreground">
                      No SKU data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard(props: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint: string;
}): ReactElement {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase text-muted-foreground">{props.label}</p>
        <props.icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{props.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}
