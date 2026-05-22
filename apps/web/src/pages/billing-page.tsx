import type { ReactElement } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, ReceiptText, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";

interface SubscriptionDto {
  id: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  plan: {
    name: string;
    slug: string;
    isFreeTier: boolean;
    features: { modules: { inventory: boolean; pos: boolean; hr: boolean } };
  };
}

interface SubResponse {
  data: SubscriptionDto | null;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceAmount: string;
  currencyCode: string;
  isFreeTier: boolean;
  billingInterval: "MONTHLY" | "ANNUAL" | null;
  features: SubscriptionDto["plan"]["features"] & {
    maxWarehouses?: number;
    maxProducts?: number;
    maxUsers?: number;
  };
  hasMonthlyPrice: boolean;
  hasAnnualPrice: boolean;
}

interface PlansResponse {
  data: PlanRow[];
}

interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amountDue: string;
  amountPaid: string;
  currencyCode: string;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  paidAt: string | null;
}

export function BillingPage(): ReactElement {
  const email = useSessionStore((s) => s.email);
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const sub = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiFetch<SubResponse>("/v1/billing/subscription"),
  });

  const plans = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => apiFetch<PlansResponse>("/v1/billing/plans"),
  });

  const invoices = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => apiFetch<{ data: Invoice[] }>("/v1/billing/invoices"),
  });

  const checkout = useMutation({
    mutationFn: (vars: { planSlug: string; interval?: "MONTHLY" | "ANNUAL" }) =>
      apiFetch<{ data: { url: string | null } }>("/v1/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: (res) => {
      if (res.data.url) window.location.href = res.data.url;
    },
    onSettled: () => setBusyPlan(null),
  });

  const subscribeFree = useMutation({
    mutationFn: (planSlug: string) =>
      apiFetch<{ data: { planSlug: string } }>("/v1/billing/subscribe", {
        method: "POST",
        body: JSON.stringify({ planSlug }),
      }),
    onSuccess: () => void sub.refetch(),
    onSettled: () => setBusyPlan(null),
  });

  const portal = useMutation({
    mutationFn: () =>
      apiFetch<{ data: { url: string } }>("/v1/billing/customer-portal", {
        method: "POST",
      }),
    onSuccess: (res) => {
      if (res.data.url) window.location.href = res.data.url;
    },
  });

  const onPick = (p: PlanRow): void => {
    setBusyPlan(p.slug);
    if (p.isFreeTier) {
      subscribeFree.mutate(p.slug);
    } else {
      checkout.mutate({ planSlug: p.slug, interval });
    }
  };

  const current = sub.data?.data;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing</p>
        <h1 className="text-xl font-semibold">Subscription & plans</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {email || "—"}. Only workspace owners can change plans.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Current subscription</h2>
            {sub.isLoading && (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            )}
            {sub.isError && (
              <p className="mt-2 text-sm text-red-400">{(sub.error as Error).message}</p>
            )}
            {sub.data?.data === null && (
              <p className="mt-2 text-sm text-muted-foreground">
                No active subscription record.{" "}
                <Link to="/signup" className="text-primary underline">
                  Create a workspace
                </Link>{" "}
                or pick a plan below.
              </p>
            )}
            {current && (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Plan:</span> {current.plan.name}{" "}
                  {current.plan.isFreeTier ? "(free tier)" : ""}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <StatusPill status={current.status} />
                </p>
                <p>
                  <span className="text-muted-foreground">Renews / ends:</span>{" "}
                  {new Date(current.currentPeriodEnd).toLocaleString()}
                  {current.cancelAtPeriodEnd && (
                    <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
                      Cancels at period end
                    </span>
                  )}
                </p>
                <p>
                  <span className="text-muted-foreground">Modules:</span> inv{" "}
                  {current.plan.features.modules.inventory ? "✓" : "—"} · pos{" "}
                  {current.plan.features.modules.pos ? "✓" : "—"} · hr{" "}
                  {current.plan.features.modules.hr ? "✓" : "—"}
                </p>
              </div>
            )}
          </div>
          {current?.stripeSubscriptionId && (
            <Button
              variant="subtle"
              type="button"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
            >
              <Wallet className="mr-1 h-4 w-4" /> Manage payment
            </Button>
          )}
        </div>
        {portal.isError && (
          <p className="mt-3 text-sm text-red-400">{(portal.error as Error).message}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Choose a plan</h2>
            <p className="text-xs text-muted-foreground">
              Paid plans use secure Stripe checkout. Free plans activate immediately.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-border p-1">
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs font-medium ${
                interval === "MONTHLY" ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
              onClick={() => setInterval("MONTHLY")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs font-medium ${
                interval === "ANNUAL" ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
              onClick={() => setInterval("ANNUAL")}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(plans.data?.data ?? []).map((p) => {
            const isCurrent = current?.plan.slug === p.slug;
            const stripeReady =
              p.isFreeTier ||
              (interval === "MONTHLY" ? p.hasMonthlyPrice : p.hasAnnualPrice);
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-lg border p-4 ${
                  isCurrent ? "border-primary ring-1 ring-primary/30" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.isFreeTier && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                      Free
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                <p className="mt-3 text-2xl font-semibold">
                  {p.isFreeTier
                    ? "$0"
                    : `${p.currencyCode} ${p.priceAmount}`}
                  {!p.isFreeTier && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}/ {interval === "ANNUAL" ? "yr" : "mo"}
                    </span>
                  )}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <li>Inventory: {p.features.modules?.inventory ? "✓" : "—"}</li>
                  <li>POS: {p.features.modules?.pos ? "✓" : "—"}</li>
                  <li>HR: {p.features.modules?.hr ? "✓" : "—"}</li>
                  {typeof p.features.maxWarehouses === "number" && (
                    <li>Warehouses: {p.features.maxWarehouses}</li>
                  )}
                  {typeof p.features.maxUsers === "number" && (
                    <li>Users: {p.features.maxUsers}</li>
                  )}
                </ul>
                <div className="mt-4">
                  <Button
                    type="button"
                    className="w-full"
                    variant={isCurrent ? "subtle" : "default"}
                    disabled={
                      busyPlan === p.slug ||
                      checkout.isPending ||
                      subscribeFree.isPending ||
                      (!stripeReady && !p.isFreeTier)
                    }
                    onClick={() => onPick(p)}
                  >
                    {isCurrent
                      ? "Current"
                      : p.isFreeTier
                        ? "Switch to free"
                        : stripeReady
                          ? <>Subscribe <ArrowRight className="ml-1 h-3 w-3" /></>
                          : "Not configured"}
                  </Button>
                  {!stripeReady && !p.isFreeTier && (
                    <p className="mt-1 text-[10px] text-amber-400">
                      Operator must attach a Stripe price for this plan.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {(checkout.isError || subscribeFree.isError) && (
          <p className="mt-3 text-sm text-red-400">
            {((checkout.error || subscribeFree.error) as Error)?.message}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Invoices</h2>
            <p className="text-xs text-muted-foreground">
              Synced from Stripe via secure webhook.
            </p>
          </div>
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">Issued</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {(invoices.data?.data ?? []).map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 font-mono text-xs">{i.number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(i.issuedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    {i.currencyCode} {Number(i.amountDue).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="rounded bg-muted px-2 py-0.5 uppercase">
                      {i.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {i.hostedInvoiceUrl && (
                      <a
                        href={i.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-primary hover:underline"
                      >
                        View <ExternalLink className="ml-0.5 inline h-3 w-3" />
                      </a>
                    )}
                    {i.invoicePdfUrl && (
                      <a
                        href={i.invoicePdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.data?.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }): ReactElement {
  const c =
    status === "ACTIVE"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "PAST_DUE"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${c}`}>{status}</span>
  );
}
