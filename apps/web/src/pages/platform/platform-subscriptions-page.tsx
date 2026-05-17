import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import { adminDownloadCsv } from "@/lib/admin-download";
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionRow,
  inputClass,
  labelClass,
} from "@/lib/platform-types";
import { PageHeader } from "@/components/platform/page-header";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export function PlatformSubscriptionsPage(): ReactElement {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [editRow, setEditRow] = useState<SubscriptionRow | null>(null);
  const [reminderRow, setReminderRow] = useState<SubscriptionRow | null>(null);
  const [reminderMessage, setReminderMessage] = useState(
    "Your subscription renews soon. Please update billing to avoid interruption.",
  );
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const queryKey = ["admin-subs", statusFilter, expiringOnly];
  const q = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (expiringOnly) params.set("expiringWithinDays", "30");
      const qs = params.toString();
      return adminApiFetch<{ data: SubscriptionRow[] }>(
        `/v1/admin/subscriptions${qs ? `?${qs}` : ""}`,
      );
    },
  });

  const patchSub = useMutation({
    mutationFn: (body: {
      id: string;
      status?: string;
      planSlug?: string;
      currentPeriodEnd?: string;
    }) =>
      adminApiFetch(`/v1/admin/subscriptions/${body.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: body.status,
          planSlug: body.planSlug,
          currentPeriodEnd: body.currentPeriodEnd,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-subs"] });
      setEditRow(null);
    },
  });

  const extendSub = useMutation({
    mutationFn: (id: string) =>
      adminApiFetch(`/v1/admin/subscriptions/${id}/extend-period`, {
        method: "POST",
        body: JSON.stringify({ billingInterval: "MONTHLY" }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-subs"] }),
  });

  const remindSub = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      adminApiFetch<{ data: { note?: string } }>(`/v1/admin/subscriptions/${id}/reminders`, {
        method: "POST",
        body: JSON.stringify({ message, channel: "EMAIL", templateKey: "RENEWAL_DUE" }),
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin-subs"] });
      setReminderNote(res.data.note ?? "Reminder logged.");
      setReminderRow(null);
    },
  });

  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () =>
      adminApiFetch<{ data: { slug: string; name: string }[] }>("/v1/admin/plans"),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Subscriptions"
        description="View and manage customer billing periods, plan assignments, and renewal reminders."
        actions={
          <Button
            type="button"
            variant="subtle"
            disabled={exporting}
            onClick={() => {
              setExporting(true);
              void adminDownloadCsv("/v1/admin/export/subscriptions", "subscriptions.csv").finally(
                () => setExporting(false),
              );
            }}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />
      {reminderNote && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{reminderNote}</p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="text-sm">
          <span className={labelClass}>Status</span>
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={expiringOnly}
            onChange={(e) => setExpiringOnly(e.target.checked)}
            className="rounded border-border"
          />
          Expiring within 30 days
        </label>
        <Button type="button" variant="subtle" onClick={() => void q.refetch()}>
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {q.isError && <p className="p-4 text-sm text-red-400">{(q.error as Error).message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Period end</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.tenant.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3">{r.plan.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.currentPeriodEnd).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="subtle" type="button" onClick={() => setEditRow(r)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      type="button"
                      className="ml-1"
                      onClick={() => void extendSub.mutate(r.id)}
                    >
                      +1 mo
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      className="ml-1"
                      onClick={() => {
                        setReminderRow(r);
                        setReminderMessage(
                          `Hi ${r.tenant.name}, your ${r.plan.name} plan renews on ${new Date(r.currentPeriodEnd).toLocaleDateString()}.`,
                        );
                      }}
                    >
                      Remind
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(q.data?.data.length ?? 0) === 0 && !q.isLoading && (
          <p className="p-6 text-center text-sm text-muted-foreground">No subscriptions match filters.</p>
        )}
      </div>

      <Dialog open={Boolean(editRow)} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogTitle>Edit subscription</DialogTitle>
          <DialogDescription>
            {editRow?.tenant.name} — {editRow?.plan.name}
          </DialogDescription>
          {editRow && (
            <EditSubscriptionForm
              row={editRow}
              plans={plans.data?.data ?? []}
              pending={patchSub.isPending}
              onSubmit={(data) => patchSub.mutate({ id: editRow.id, ...data })}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reminderRow)} onOpenChange={(open) => !open && setReminderRow(null)}>
        <DialogContent>
          <DialogTitle>Send renewal reminder</DialogTitle>
          <DialogDescription>
            Logged for audit. Connect email delivery in production to notify customers.
          </DialogDescription>
          <label className="mt-2 block text-sm">
            <span className={labelClass}>Message</span>
            <textarea
              className={`${inputClass} min-h-[100px]`}
              value={reminderMessage}
              onChange={(e) => setReminderMessage(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setReminderRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={remindSub.isPending || !reminderRow}
              onClick={() =>
                reminderRow &&
                remindSub.mutate({ id: reminderRow.id, message: reminderMessage })
              }
            >
              {remindSub.isPending ? "Sending…" : "Log reminder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditSubscriptionForm({
  row,
  plans,
  pending,
  onSubmit,
}: {
  row: SubscriptionRow;
  plans: { slug: string; name: string }[];
  pending: boolean;
  onSubmit: (data: { status?: string; planSlug?: string; currentPeriodEnd?: string }) => void;
}): ReactElement {
  const [status, setStatus] = useState(row.status);
  const [planSlug, setPlanSlug] = useState(row.plan.slug);
  const [periodEnd, setPeriodEnd] = useState(row.currentPeriodEnd.slice(0, 16));

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    onSubmit({
      status,
      planSlug,
      currentPeriodEnd: new Date(periodEnd).toISOString(),
    });
  };

  return (
    <form className="space-y-3 pt-2" onSubmit={handleSubmit}>
      <label className="block text-sm">
        <span className={labelClass}>Status</span>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          {SUBSCRIPTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Plan</span>
        <select className={inputClass} value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
          {plans.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Period end</span>
        <input
          type="datetime-local"
          className={inputClass}
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
