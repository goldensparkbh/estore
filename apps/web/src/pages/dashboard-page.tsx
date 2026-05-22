import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Box,
  CheckCircle2,
  Circle,
  CreditCard,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface TenantResponse {
  data: {
    id: string;
    name: string;
    timezone: string;
    baseCurrencyCode: string;
  } | null;
}

interface SubResponse {
  data: {
    plan: { name: string; slug: string; isFreeTier: boolean };
    currentPeriodEnd: string;
    status: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}

interface TeamResponse {
  data: { id: string; isActive: boolean }[];
}

interface InvoicesResponse {
  data: { amountDue: string; currencyCode: string; status: string }[];
}

interface WarehouseLite { id: string }
interface ProductLite { id: string }
interface EmployeeLite { id: string }
interface LowStockRow { ruleId: string }

interface SalesMetricsResponse {
  data: {
    today: { count: number; total: string };
    last30Days: { count: number; total: string };
    lifetime: { count: number; total: string };
  };
}

export function DashboardPage(): ReactElement {
  const tenant = useQuery({
    queryKey: ["tenant"],
    queryFn: () => apiFetch<TenantResponse>("/v1/reference/tenant"),
  });

  const sub = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiFetch<SubResponse>("/v1/billing/subscription"),
  });

  const team = useQuery({
    queryKey: ["team-users"],
    queryFn: () => apiFetch<TeamResponse>("/v1/team"),
  });

  const invoices = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => apiFetch<InvoicesResponse>("/v1/billing/invoices"),
  });

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      apiFetch<{ data: WarehouseLite[] }>("/v1/inventory/warehouses"),
  });

  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: () =>
      apiFetch<{ data: ProductLite[] }>("/v1/inventory/products"),
  });

  const employeesQ = useQuery({
    queryKey: ["employees"],
    queryFn: () =>
      apiFetch<{ data: EmployeeLite[] }>("/v1/hr/employees"),
  });

  const salesMetrics = useQuery({
    queryKey: ["pos-metrics"],
    queryFn: () => apiFetch<SalesMetricsResponse>("/v1/pos/sales/metrics"),
  });

  const lowStock = useQuery({
    queryKey: ["low-stock"],
    queryFn: () =>
      apiFetch<{ data: LowStockRow[] }>("/v1/inventory/low-stock"),
  });

  const activeUsers = (team.data?.data ?? []).filter((u) => u.isActive).length;
  const totalUsers = (team.data?.data ?? []).length;
  const inv = invoices.data?.data ?? [];
  const lastPaid = inv.find((i) => i.status === "paid");
  const periodEnd = sub.data?.data
    ? new Date(sub.data.data.currentPeriodEnd)
    : null;
  const daysToRenew = periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Workspace
        </p>
        <h1 className="text-2xl font-semibold">
          {tenant.data?.data?.name ?? "Loading…"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tenant.data?.data
            ? `Base currency ${tenant.data.data.baseCurrencyCode} · TZ ${tenant.data.data.timezone}`
            : "Loading your workspace…"}
        </p>
      </div>

      <OnboardingChecklist
        warehouseCount={warehouses.data?.data?.length ?? 0}
        productCount={productsQ.data?.data?.length ?? 0}
        employeeCount={employeesQ.data?.data?.length ?? 0}
        teamCount={totalUsers}
      />

      {sub.data?.data && sub.data.data.status === "PAST_DUE" && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
          <div className="flex-1">
            <p className="font-medium text-amber-200">
              Subscription needs attention
            </p>
            <p className="text-xs text-amber-200/80">
              Your last payment failed. Open billing to update your card before
              the workspace is paused.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link to="/app/billing">Open billing</Link>
          </Button>
        </div>
      )}

      {lowStock.data?.data && lowStock.data.data.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
          <div className="flex-1">
            <p className="font-medium text-amber-200">
              {lowStock.data.data.length} product
              {lowStock.data.data.length === 1 ? "" : "s"} need restocking
            </p>
            <p className="text-xs text-amber-200/80">
              On-hand stock dropped to or below the reorder threshold.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link to="/app/inventory">Open inventory</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Today's sales"
          value={
            salesMetrics.data
              ? `${tenant.data?.data?.baseCurrencyCode ?? ""} ${Number(salesMetrics.data.data.today.total).toFixed(2)}`
              : "—"
          }
          hint={`${salesMetrics.data?.data.today.count ?? 0} transactions`}
          icon={ShoppingBag}
          to="/app/pos"
        />
        <KpiCard
          label="Last 30 days"
          value={
            salesMetrics.data
              ? `${tenant.data?.data?.baseCurrencyCode ?? ""} ${Number(salesMetrics.data.data.last30Days.total).toFixed(2)}`
              : "—"
          }
          hint={`${salesMetrics.data?.data.last30Days.count ?? 0} sales`}
          icon={TrendingUp}
          to="/app/pos"
        />
        <KpiCard
          label="Team"
          value={`${activeUsers}/${totalUsers}`}
          hint={`${activeUsers} active members`}
          icon={Users}
          to="/app/team"
        />
        <KpiCard
          label="Low stock"
          value={`${lowStock.data?.data?.length ?? 0}`}
          hint="Items below reorder threshold"
          icon={Box}
          to="/app/inventory"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Subscription"
          value={sub.data?.data?.plan.name ?? "—"}
          hint={
            sub.data?.data
              ? sub.data.data.plan.isFreeTier
                ? "Free tier"
                : `${sub.data.data.status}`
              : "No plan"
          }
          icon={Receipt}
          to="/app/billing"
        />
        <KpiCard
          label="Renews in"
          value={daysToRenew !== null ? `${daysToRenew} days` : "—"}
          hint={
            periodEnd
              ? `Period end ${periodEnd.toLocaleDateString()}`
              : "No active period"
          }
          icon={CreditCard}
          to="/app/billing"
        />
        <KpiCard
          label="Last invoice"
          value={
            lastPaid
              ? `${lastPaid.currencyCode} ${Number(lastPaid.amountDue).toFixed(2)}`
              : "—"
          }
          hint={lastPaid ? "Paid" : "No invoices yet"}
          icon={Receipt}
          to="/app/billing"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <QuickCard
          title="Inventory"
          body="Multi-warehouse stock, FIFO/LIFO, transfers, and audit-friendly movements."
          to="/app/inventory"
        />
        <QuickCard
          title="Point of Sale"
          body="Keyboard-first checkout, offline-tolerant queueing, hardware-friendly."
          to="/app/pos"
        />
        <QuickCard
          title="HR & Payroll"
          body="Directory, attendance, leave, and payroll runs with payslips."
          to="/app/hr"
        />
        <QuickCard
          title="Workspace settings"
          body="Edit your profile, change your password, and manage your workspace."
          to="/app/account"
        />
      </div>
    </div>
  );
}

function KpiCard(props: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Receipt;
  to: string;
}): ReactElement {
  return (
    <Link
      to={props.to}
      className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {props.label}
        </p>
        <props.icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-xl font-semibold">{props.value}</p>
      {props.hint && (
        <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
      )}
    </Link>
  );
}

function OnboardingChecklist(props: {
  warehouseCount: number;
  productCount: number;
  employeeCount: number;
  teamCount: number;
}): ReactElement | null {
  const steps = [
    {
      label: "Add your first warehouse",
      done: props.warehouseCount > 0,
      to: "/app/inventory",
    },
    {
      label: "Add your first product",
      done: props.productCount > 0,
      to: "/app/inventory",
    },
    {
      label: "Invite a workspace user",
      done: props.teamCount > 1,
      to: "/app/team",
    },
    {
      label: "Add an employee (optional)",
      done: props.employeeCount > 0,
      to: "/app/hr",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary">
            Getting started
          </p>
          <h2 className="text-base font-semibold">
            {completed}/{steps.length} setup steps complete
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          Tip: complete these to make every module useful
        </span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              to={s.to}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-2">
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={s.done ? "line-through text-muted-foreground" : ""}>
                  {s.label}
                </span>
              </span>
              {!s.done && <ArrowUpRight className="h-3 w-3 text-muted-foreground" />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickCard(props: {
  title: string;
  body: string;
  to: string;
}): ReactElement {
  return (
    <Link
      to={props.to}
      className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div>
        <p className="text-sm font-semibold">{props.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{props.body}</p>
      </div>
      <ArrowUpRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
