import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  Play,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useSessionStore } from "@/stores/session-store";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  employeeCount: number;
}

interface EmployeeRow {
  id: string;
  employeeNumber: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  baseSalary: string;
  salaryCurrency: string;
  isActive: boolean;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT";
  hireDate: string;
  department: { id: string; name: string; code: string } | null;
}

interface AttendanceRow {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  overtimeMinutes: number;
  employee: { id: string; fullName: string; employeeNumber: string };
}

type Tab = "employees" | "departments" | "attendance" | "leave" | "payroll";

interface LeavePolicyRow {
  id: string;
  name: string;
  accrualHoursPerMonth: string;
  maxCarryoverHours: string;
  approvalTier: number;
}

interface LeaveRequestRow {
  id: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  startAt: string;
  endAt: string;
  hours: string;
  decidedAt: string | null;
  balanceAfter: string | null;
  employee: { id: string; fullName: string; employeeNumber: string };
  approver: { id: string; fullName: string } | null;
  policy: { id: string; name: string };
}

interface PayrollRunRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  runAt: string;
  processedBy: string;
  status: string;
  currencyCode: string;
  payslipCount: number;
}

interface PayslipRow {
  id: string;
  employee: { fullName: string; employeeNumber: string };
  grossPay: string;
  bonusPay: string;
  taxDeduction: string;
  insuranceAmt: string;
  netPay: string;
  currencyCode: string;
  hasPdf: boolean;
  issuedAt: string;
}

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function HrPage(): ReactElement {
  const [tab, setTab] = useState<Tab>("employees");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">HR</p>
        <h1 className="text-xl font-semibold">People, departments & attendance</h1>
        <p className="text-sm text-muted-foreground">
          Manage your workforce. Payroll runs are processed server-side.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-border p-1">
        {(
          [
            { id: "employees", label: "Employees" },
            { id: "departments", label: "Departments" },
            { id: "attendance", label: "Attendance" },
            { id: "leave", label: "Leave" },
            { id: "payroll", label: "Payroll" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded px-3 py-1 text-xs font-medium ${
              tab === t.id ? "bg-muted text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "employees" && <EmployeesTab />}
      {tab === "departments" && <DepartmentsTab />}
      {tab === "attendance" && <AttendanceTab />}
      {tab === "leave" && <LeaveTab />}
      {tab === "payroll" && <PayrollTab />}
    </div>
  );
}

function LeaveTab(): ReactElement {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiFetch<{ data: EmployeeRow[] }>("/v1/hr/employees"),
  });
  const policies = useQuery({
    queryKey: ["leave-policies"],
    queryFn: () =>
      apiFetch<{ data: LeavePolicyRow[] }>("/v1/hr/leave/policies"),
  });
  const requests = useQuery({
    queryKey: ["leave-requests"],
    queryFn: () =>
      apiFetch<{ data: LeaveRequestRow[] }>("/v1/hr/leave/requests"),
  });

  const decide = useMutation({
    mutationFn: (vars: {
      requestId: string;
      approverEmployeeId: string;
      status: "APPROVED" | "REJECTED";
    }) =>
      apiFetch("/v1/hr/leave/decision", {
        method: "POST",
        body: JSON.stringify({
          leaveRequestId: vars.requestId,
          approverEmployeeId: vars.approverEmployeeId,
          status: vars.status,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leave-requests"] }),
  });

  const firstApprover = employees.data?.data?.find((e) => e.isActive)?.id ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PolicyManager
          policies={policies.data?.data ?? []}
          onSaved={() =>
            void qc.invalidateQueries({ queryKey: ["leave-policies"] })
          }
        />
        <Button
          type="button"
          onClick={() => setCreating(true)}
          disabled={(policies.data?.data ?? []).length === 0}
        >
          <Plus className="mr-1 h-4 w-4" /> New leave request
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Policy</th>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {requests.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(requests.data?.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <p className="font-medium">{r.employee.fullName}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {r.employee.employeeNumber}
                  </p>
                </td>
                <td className="px-4 py-2 text-xs">{r.policy.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(r.startAt).toLocaleDateString()} →{" "}
                  {new Date(r.endAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right font-mono">{r.hours}</td>
                <td className="px-4 py-2 text-xs">
                  <LeaveBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "PENDING" && firstApprover && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        title="Approve"
                        onClick={() =>
                          decide.mutate({
                            requestId: r.id,
                            approverEmployeeId: firstApprover,
                            status: "APPROVED",
                          })
                        }
                      >
                        <Check className="h-3 w-3 text-emerald-400" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        title="Reject"
                        onClick={() =>
                          decide.mutate({
                            requestId: r.id,
                            approverEmployeeId: firstApprover,
                            status: "REJECTED",
                          })
                        }
                      >
                        <X className="h-3 w-3 text-red-400" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {requests.data?.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  No leave requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LeaveRequestDialog
        open={creating}
        employees={employees.data?.data ?? []}
        policies={policies.data?.data ?? []}
        onClose={() => setCreating(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["leave-requests"] })}
      />
    </div>
  );
}

function LeaveBadge({ status }: { status: LeaveRequestRow["status"] }): ReactElement {
  const c =
    status === "APPROVED"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "REJECTED"
        ? "bg-red-500/15 text-red-400"
        : status === "PENDING"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${c}`}>
      {status}
    </span>
  );
}

function PolicyManager(props: {
  policies: LeavePolicyRow[];
  onSaved: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accrual, setAccrual] = useState("8");
  const [carryover, setCarryover] = useState("40");

  const mut = useMutation({
    mutationFn: () =>
      apiFetch("/v1/hr/leave/policies", {
        method: "POST",
        body: JSON.stringify({
          name,
          accrualHoursPerMonth: accrual,
          maxCarryoverHours: carryover,
        }),
      }),
    onSuccess: () => {
      props.onSaved();
      setName("");
      setOpen(false);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Policies: {props.policies.length}
      </span>
      <Button variant="subtle" size="sm" type="button" onClick={() => setOpen(true)}>
        Add policy
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>New leave policy</DialogTitle>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
          >
            <div className="space-y-1">
              <label className={labelClass}>Name</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelClass}>Hours / month</label>
                <input
                  className={`${inputClass} font-mono`}
                  value={accrual}
                  onChange={(e) => setAccrual(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Max carryover</label>
                <input
                  className={`${inputClass} font-mono`}
                  value={carryover}
                  onChange={(e) => setCarryover(e.target.value)}
                  required
                />
              </div>
            </div>
            {mut.isError && (
              <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="subtle" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaveRequestDialog(props: {
  open: boolean;
  employees: EmployeeRow[];
  policies: LeavePolicyRow[];
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const [employeeId, setEmployeeId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hours, setHours] = useState("8");

  const mut = useMutation({
    mutationFn: () =>
      apiFetch("/v1/hr/leave/requests", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          policyId,
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
          hours,
        }),
      }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>New leave request</DialogTitle>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-1">
            <label className={labelClass}>Employee</label>
            <select
              className={inputClass}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {props.employees
                .filter((e) => e.isActive)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeNumber} — {e.fullName}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Policy</label>
            <select
              className={inputClass}
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {props.policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Start</label>
              <input
                type="datetime-local"
                className={inputClass}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>End</label>
              <input
                type="datetime-local"
                className={inputClass}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Hours</label>
            <input
              className={`${inputClass} font-mono`}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="subtle" type="button" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Submit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayrollTab(): ReactElement {
  const qc = useQueryClient();
  const tenantId = useSessionStore((s) => s.tenantId);
  const userId = useSessionStore((s) => s.userId);
  const [openRun, setOpenRun] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const runs = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: () =>
      apiFetch<{ data: PayrollRunRow[] }>("/v1/hr/payroll/runs"),
  });

  const payslips = useQuery({
    queryKey: ["payslips", openRunId],
    queryFn: () =>
      apiFetch<{ data: PayslipRow[] }>(
        `/v1/hr/payroll/runs/${openRunId}/payslips`,
      ),
    enabled: Boolean(openRunId),
  });

  const downloadPdf = (id: string): void => {
    fetch(`/v1/hr/payslips/${id}/pdf`, {
      headers: { "x-tenant-id": tenantId, "x-user-id": userId },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      })
      .catch((err) => console.error(err));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpenRun(true)}>
          <Play className="mr-1 h-4 w-4" /> Run payroll
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">Processed by</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Payslips</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(runs.data?.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs">
                  {new Date(r.periodStart).toLocaleDateString()} →{" "}
                  {new Date(r.periodEnd).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {r.processedBy}
                </td>
                <td className="px-4 py-2 text-xs">{r.status}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {r.payslipCount}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="subtle"
                    type="button"
                    onClick={() => setOpenRunId(r.id)}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
            {runs.data?.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No payroll runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PayrollRunDialog
        open={openRun}
        onClose={() => setOpenRun(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["payroll-runs"] })}
      />

      <Dialog open={Boolean(openRunId)} onOpenChange={(v) => !v && setOpenRunId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogTitle>Payslips</DialogTitle>
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(payslips.data?.data ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      <p>{s.employee.fullName}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {s.employee.employeeNumber}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {s.currencyCode} {Number(s.grossPay).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {s.currencyCode} {Number(s.taxDeduction).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.currencyCode} {Number(s.netPay).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.hasPdf && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => downloadPdf(s.id)}
                        >
                          <FileText className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {payslips.data?.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      No payslips in this run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayrollRunDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const today = new Date();
  const firstOfThisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    1,
  );
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 1);
  const firstOfPrevMonth = new Date(
    lastOfPrevMonth.getFullYear(),
    lastOfPrevMonth.getMonth(),
    1,
  );

  const [start, setStart] = useState(firstOfPrevMonth.toISOString().slice(0, 10));
  const [end, setEnd] = useState(lastOfPrevMonth.toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("USD");
  const [bonus, setBonus] = useState("0");
  const [tax, setTax] = useState("10");
  const [ins, setIns] = useState("5");
  const [processedBy, setProcessedBy] = useState("Owner");

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<{ data: { payslipCount: number } }>("/v1/hr/payroll/run", {
        method: "POST",
        body: JSON.stringify({
          processedByLabel: processedBy,
          periodStart: new Date(start).toISOString(),
          periodEnd: new Date(end).toISOString(),
          currencyCode: currency,
          bonusRatePercent: bonus,
          taxRatePercent: tax,
          insuranceRatePercent: ins,
        }),
      }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Run payroll</DialogTitle>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Period start</label>
              <input
                type="date"
                className={inputClass}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Period end</label>
              <input
                type="date"
                className={inputClass}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Processed by (label)</label>
            <input
              className={inputClass}
              value={processedBy}
              onChange={(e) => setProcessedBy(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Currency</label>
            <input
              maxLength={3}
              className={`${inputClass} font-mono`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Bonus %</label>
              <input
                className={`${inputClass} font-mono`}
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Tax %</label>
              <input
                className={`${inputClass} font-mono`}
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Insurance %</label>
              <input
                className={`${inputClass} font-mono`}
                value={ins}
                onChange={(e) => setIns(e.target.value)}
              />
            </div>
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Generates one payslip per active employee with computed gross / tax /
            insurance / net and a stored PDF.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="subtle" type="button" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Run
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesTab(): ReactElement {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EmployeeRow | "new" | null>(null);

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiFetch<{ data: EmployeeRow[] }>("/v1/hr/employees"),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiFetch<{ data: DepartmentRow[] }>("/v1/hr/departments"),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/hr/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const clockIn = useMutation({
    mutationFn: (employeeId: string) =>
      apiFetch("/v1/hr/attendance/clock-in", {
        method: "POST",
        body: JSON.stringify({ employeeId }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["attendance"] }),
  });

  const clockOut = useMutation({
    mutationFn: (employeeId: string) =>
      apiFetch("/v1/hr/attendance/clock-out", {
        method: "POST",
        body: JSON.stringify({ employeeId }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["attendance"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" /> New employee
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Employee #</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Salary</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(employees.data?.data ?? []).map((e) => (
              <tr key={e.id} className={e.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2 font-mono text-xs">{e.employeeNumber}</td>
                <td className="px-4 py-2">
                  <p className="font-medium">{e.fullName}</p>
                  {e.jobTitle && (
                    <p className="text-[11px] text-muted-foreground">
                      {e.jobTitle}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {e.email}
                </td>
                <td className="px-4 py-2 text-xs">
                  {e.department ? `${e.department.code} · ${e.department.name}` : "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {e.employmentType.replace("_", " ")}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {e.salaryCurrency} {e.baseSalary}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    title="Clock in"
                    onClick={() => clockIn.mutate(e.id)}
                  >
                    <LogIn className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    title="Clock out"
                    onClick={() => clockOut.mutate(e.id)}
                  >
                    <LogOut className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    title="Edit"
                    onClick={() => setEditing(e)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {e.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      title="Deactivate"
                      onClick={() => {
                        if (window.confirm(`Deactivate ${e.fullName}?`))
                          del.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {employees.data?.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(del.isError || clockIn.isError || clockOut.isError) && (
        <p className="text-sm text-red-400">
          {((del.error || clockIn.error || clockOut.error) as Error)?.message}
        </p>
      )}
      <EmployeeDialog
        value={editing}
        departments={departments.data?.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["employees"] })}
      />
    </div>
  );
}

function EmployeeDialog(props: {
  value: EmployeeRow | "new" | null;
  departments: DepartmentRow[];
  onClose: () => void;
  onSaved: () => void;
}): ReactElement | null {
  const isNew = props.value === "new";
  const initial = props.value === "new" ? null : props.value;

  const [employeeNumber, setEmployeeNumber] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [type, setType] = useState<EmployeeRow["employmentType"]>("FULL_TIME");
  const [hireDate, setHireDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [salary, setSalary] = useState("0");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (!initial) {
      setEmployeeNumber("");
      setEmail("");
      setFullName("");
      setJobTitle("");
      setDepartmentId("");
      setType("FULL_TIME");
      setHireDate(new Date().toISOString().slice(0, 10));
      setSalary("0");
      setCurrency("USD");
      return;
    }
    setEmployeeNumber(initial.employeeNumber);
    setEmail(initial.email);
    setFullName(initial.fullName);
    setJobTitle(initial.jobTitle ?? "");
    setDepartmentId(initial.department?.id ?? "");
    setType(initial.employmentType);
    setHireDate(initial.hireDate.slice(0, 10));
    setSalary(initial.baseSalary);
    setCurrency(initial.salaryCurrency);
  }, [initial]);

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? apiFetch("/v1/hr/employees", {
            method: "POST",
            body: JSON.stringify(body),
          })
        : apiFetch(`/v1/hr/employees/${initial?.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
    },
  });

  if (props.value === null) return null;

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      employeeNumber,
      email,
      fullName,
      jobTitle: jobTitle || null,
      departmentId: departmentId || null,
      employmentType: type,
      baseSalary: salary,
      salaryCurrency: currency,
    };
    if (isNew) {
      payload.hireDate = new Date(hireDate).toISOString();
    }
    mut.mutate(payload);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{isNew ? "New employee" : `Edit ${initial?.fullName}`}</DialogTitle>
        <form className="mt-4 grid grid-cols-2 gap-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className={labelClass}>Employee #</label>
            <input
              className={`${inputClass} font-mono`}
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className={labelClass}>Full name</label>
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Job title</label>
            <input
              className={inputClass}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Department</label>
            <select
              className={inputClass}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">— None —</option>
              {props.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Employment type</label>
            <select
              className={inputClass}
              value={type}
              onChange={(e) =>
                setType(e.target.value as EmployeeRow["employmentType"])
              }
            >
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Hire date</label>
            <input
              type="date"
              className={inputClass}
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              disabled={!isNew}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Base salary</label>
            <input
              className={`${inputClass} font-mono`}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Currency</label>
            <input
              maxLength={3}
              className={`${inputClass} font-mono`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              required
            />
          </div>
          {mut.isError && (
            <p className="col-span-2 text-sm text-red-400">
              {(mut.error as Error).message}
            </p>
          )}
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentsTab(): ReactElement {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const q = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiFetch<{ data: DepartmentRow[] }>("/v1/hr/departments"),
  });

  const add = useMutation({
    mutationFn: () =>
      apiFetch("/v1/hr/departments", {
        method: "POST",
        body: JSON.stringify({ name, code: code.toUpperCase() }),
      }),
    onSuccess: () => {
      setName("");
      setCode("");
      void qc.invalidateQueries({ queryKey: ["departments"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/hr/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="space-y-1">
          <label className={labelClass}>Code</label>
          <input
            className={`${inputClass} w-32 font-mono uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Name</label>
          <input
            className={`${inputClass} w-64`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={add.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add department
        </Button>
        {add.isError && (
          <p className="text-sm text-red-400">{(add.error as Error).message}</p>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2 text-right">Employees</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(q.data?.data ?? []).map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-mono text-xs">{d.code}</td>
                <td className="px-4 py-2">{d.name}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {d.employeeCount}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete department ${d.name}?`))
                        del.mutate(d.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {q.data?.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted-foreground">
                  No departments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceTab(): ReactElement {
  const q = useQuery({
    queryKey: ["attendance"],
    queryFn: () =>
      apiFetch<{ data: AttendanceRow[] }>("/v1/hr/attendance/recent"),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Recent attendance</p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Employee</th>
            <th className="px-4 py-2">Clock in</th>
            <th className="px-4 py-2">Clock out</th>
            <th className="px-4 py-2 text-right">Overtime (min)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {q.isLoading && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-muted-foreground">
                Loading…
              </td>
            </tr>
          )}
          {(q.data?.data ?? []).map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2">
                <p className="font-medium">{a.employee.fullName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {a.employee.employeeNumber}
                </p>
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {new Date(a.clockInAt).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {a.clockOutAt
                  ? new Date(a.clockOutAt).toLocaleString()
                  : "— in progress —"}
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {a.overtimeMinutes}
              </td>
            </tr>
          ))}
          {q.data?.data?.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-muted-foreground">
                No attendance records yet. Use the clock buttons on the Employees
                tab.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
