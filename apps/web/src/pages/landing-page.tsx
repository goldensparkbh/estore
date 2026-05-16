import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Box,
  CreditCard,
  Layers,
  Lock,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicApiFetch } from "@/lib/public-api";

interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  billingInterval: string | null;
  priceAmount: string;
  currencyCode: string;
  isFreeTier: boolean;
  trialDays: number;
  features: {
    modules?: { inventory?: boolean; pos?: boolean; hr?: boolean };
    maxWarehouses?: number;
    maxProducts?: number;
    maxUsers?: number;
  };
}

interface PlansResponse {
  data: PublicPlan[];
}

export function LandingPage(): ReactElement {
  const plans = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => publicApiFetch<PlansResponse>("/v1/public/plans"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-sm font-semibold tracking-tight">ERP Control</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/platform/login">Operators</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup?plan=free">Start free</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Cloud ERP</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
          Operations, inventory, POS, and workforce in one controlled workspace.
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Multi-tenant by design with audited stock movements, subscription-backed feature access,
          and a keyboard-first POS. Pick a package that fits; upgrade whenever you outgrow limits.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/signup?plan=free">
              Create workspace <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="subtle" asChild>
            <Link to="/login">I already have an account</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-muted/20 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {[
            {
              title: "Inventory & warehouses",
              body: "Multi-location stock, FIFO/LIFO, transfers, and adjustments with full audit trails.",
              icon: Box,
            },
            {
              title: "Point of sale",
              body: "Low-latency checkout, offline queueing, and hardware-friendly keyboard flows.",
              icon: CreditCard,
            },
            {
              title: "HR & payroll",
              body: "Directory, attendance, leave, and payroll runs with payslip generation on paid tiers.",
              icon: Users,
            },
            {
              title: "Enterprise security",
              body: "Hard tenant isolation on every API call and structured subscription enforcement.",
              icon: Lock,
            },
            {
              title: "Analytics-ready",
              body: "Operational reporting hooks with optional high-volume analytics backends.",
              icon: BarChart3,
            },
            {
              title: "Fast UI",
              body: "Dense tables, command palette navigation, and dark mode tuned for long shifts.",
              icon: Zap,
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <f.icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Packages
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Simple subscription tiers</h2>
          </div>
          <Layers className="hidden h-8 w-8 text-muted-foreground/40 md:block" aria-hidden />
        </div>

        {plans.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading plans…</p>}
        {plans.isError && (
          <p className="mt-8 text-sm text-red-400">{(plans.error as Error).message}</p>
        )}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {(plans.data?.data ?? []).map((p) => (
            <div
              key={p.id}
              className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${
                p.slug === "business-monthly" ? "border-primary ring-1 ring-primary/30" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.isFreeTier && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    Free
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {p.isFreeTier ? "$0" : `${p.currencyCode} ${p.priceAmount}`}
                {!p.isFreeTier && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {p.billingInterval === "ANNUAL" ? "yr" : "mo"}
                  </span>
                )}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                <li>Inventory: {p.features.modules?.inventory ? "Included" : "—"}</li>
                <li>POS: {p.features.modules?.pos ? "Included" : "—"}</li>
                <li>HR: {p.features.modules?.hr ? "Included" : "Upgrade"}</li>
                <li className="text-xs text-muted-foreground/90">
                  Limits: {p.features.maxWarehouses ?? "—"} WH · {p.features.maxProducts ?? "—"} SKUs
                  {typeof p.features.maxUsers === "number" ? ` · ${p.features.maxUsers} users` : ""}
                </li>
              </ul>
              <Button className="mt-6 w-full" asChild>
                <Link to={`/signup?plan=${encodeURIComponent(p.slug)}`}>
                  {p.isFreeTier ? "Start free" : "Subscribe"}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ERP Control · Subscription terms apply during paid periods.
      </footer>
    </div>
  );
}
