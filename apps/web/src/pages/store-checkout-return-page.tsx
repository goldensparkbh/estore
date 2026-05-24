import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreThemeEffect } from "@/components/theme-sync";
import { publicFetch, type Storefront } from "@/lib/store-public";

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
  createdAt: string;
  capturedAt: string | null;
  refundedAt: string | null;
}

const SUCCESS = new Set(["CAPTURED"]);
const PENDING = new Set(["PENDING", "INITIATED", "AUTHORIZED"]);
const FAILED = new Set(["FAILED", "CANCELLED"]);

function statusTone(status: string): "success" | "pending" | "failed" | "refund" {
  if (SUCCESS.has(status)) return "success";
  if (PENDING.has(status)) return "pending";
  if (status === "REFUNDED" || status === "PARTIALLY_REFUNDED") return "refund";
  if (FAILED.has(status)) return "failed";
  return "pending";
}

export function StoreCheckoutReturnPage(): ReactElement {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  const orderId = search.get("orderId");
  const [order, setOrder] = useState<MarketplaceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const store = useQuery({
    queryKey: ["store", slug],
    queryFn: () => publicFetch<{ data: Storefront }>(`/v1/store/${slug}`),
    enabled: Boolean(slug),
  });

  useEffect(() => {
    if (!orderId || !slug) {
      setError("Missing order reference.");
      return;
    }

    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/v1/store/${slug}/checkout/${orderId}`);
        if (!res.ok) throw new Error(`Could not load order (${res.status})`);
        const json = (await res.json()) as { data: MarketplaceOrder };
        if (cancelled) return;
        setOrder(json.data);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderId, slug]);

  const tone = order ? statusTone(order.status) : "pending";

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <StoreThemeEffect uiTheme={store.data?.data?.uiTheme} />
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          {!order && !error && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Confirming your payment…</p>
            </>
          )}

          {error && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-red-400" />
              <h1 className="mt-4 text-lg font-semibold">Unable to load order</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </>
          )}

          {order && tone === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
              <h1 className="mt-4 text-lg font-semibold">Payment successful</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Order <span className="font-mono">{order.orderNumber}</span> is complete.
              </p>
            </>
          )}

          {order && tone === "pending" && (
            <>
              <Clock className="mx-auto h-10 w-10 text-amber-400" />
              <h1 className="mt-4 text-lg font-semibold">Payment {order.status.toLowerCase()}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We are waiting for TAP to confirm. This page refreshes automatically.
              </p>
            </>
          )}

          {order && tone === "failed" && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-red-400" />
              <h1 className="mt-4 text-lg font-semibold">Payment not completed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Status: {order.status}. You can try checkout again from the store.
              </p>
            </>
          )}

          {order && tone === "refund" && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-orange-400" />
              <h1 className="mt-4 text-lg font-semibold">Order refunded</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This order was {order.status.toLowerCase().replace("_", " ")}.
              </p>
            </>
          )}

          {order && (
            <div className="mt-6 space-y-3 rounded-lg border border-border bg-muted/20 p-4 text-left text-sm">
              <p className="font-medium">Payment breakdown</p>
              <dl className="space-y-1 text-xs">
                <Row label="Gross total" value={`${order.currencyCode} ${fmt(order.grossAmount)}`} />
                <Row
                  label="TAP processing (est.)"
                  value={`− ${order.currencyCode} ${fmt(order.tapFeeAmount)}`}
                  muted
                />
                <Row
                  label="Platform commission"
                  value={`− ${order.currencyCode} ${fmt(order.platformCommissionAmount)}`}
                  muted
                />
                <Row
                  label="Merchant receives"
                  value={`${order.currencyCode} ${fmt(order.tenantNetAmount)}`}
                  strong
                />
              </dl>
              <p className="text-[10px] text-muted-foreground">
                Commission rate applied: {order.commissionRateApplied}%
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild variant="subtle">
              <Link to={`/store/${slug}/shop`}>Back to shop</Link>
            </Button>
            <Button asChild>
              <Link to={`/store/${slug}`}>Store home</Link>
            </Button>
          </div>
        </div>

        {order?.events && order.events.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Status history</h2>
            <ul className="space-y-2 text-xs">
              {order.events.map((ev, i) => (
                <li key={`${ev.createdAt}-${i}`} className="flex gap-3 border-b border-border/50 pb-2 last:border-0">
                  <span className="shrink-0 text-muted-foreground whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                  <span>
                    <span className="font-mono">{ev.status}</span>
                    {ev.note && <span className="text-muted-foreground"> — {ev.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row(props: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}): ReactElement {
  return (
    <div className="flex justify-between gap-4">
      <dt className={props.muted ? "text-muted-foreground" : undefined}>{props.label}</dt>
      <dd className={props.strong ? "font-semibold" : props.muted ? "text-muted-foreground" : undefined}>
        {props.value}
      </dd>
    </div>
  );
}

function fmt(n: string): string {
  return Number(n).toFixed(2);
}
