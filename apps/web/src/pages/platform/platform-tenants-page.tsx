import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import type { TenantListItem } from "@/lib/platform-types";
import { inputClass, labelClass } from "@/lib/platform-types";
import { PageHeader } from "@/components/platform/page-header";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  baseCurrencyCode: string;
  createdAt: string;
  counts: { products: number; warehouses: number; sales: number };
  users: { id: string; email: string; displayName: string; role: string; isActive: boolean }[];
  subscriptions: { id: string; status: string; plan: { name: string; slug: string } }[];
}

export function PlatformTenantsPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editTenant, setEditTenant] = useState<TenantListItem | null>(null);
  const [assignTenant, setAssignTenant] = useState<TenantListItem | null>(null);

  const list = useQuery({
    queryKey: ["admin-tenants", search],
    queryFn: () => {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      return adminApiFetch<{ data: TenantListItem[] }>(`/v1/admin/tenants${qs}`);
    },
  });

  const detail = useQuery({
    queryKey: ["admin-tenant", detailId],
    queryFn: () => adminApiFetch<{ data: TenantDetail }>(`/v1/admin/tenants/${detailId}`),
    enabled: Boolean(detailId),
  });

  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () =>
      adminApiFetch<{ data: { slug: string; name: string }[] }>("/v1/admin/plans"),
  });

  const patchTenant = useMutation({
    mutationFn: (body: { id: string; name: string; timezone: string; baseCurrencyCode: string }) =>
      adminApiFetch(`/v1/admin/tenants/${body.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: body.name,
          timezone: body.timezone,
          baseCurrencyCode: body.baseCurrencyCode,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      setEditTenant(null);
    },
  });

  const assignPlan = useMutation({
    mutationFn: (body: { id: string; planSlug: string }) =>
      adminApiFetch(`/v1/admin/tenants/${body.id}/assign-plan`, {
        method: "POST",
        body: JSON.stringify({ planSlug: body.planSlug }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      if (detailId) void qc.invalidateQueries({ queryKey: ["admin-tenant", detailId] });
      setAssignTenant(null);
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Tenants"
        description="Organizations using the ERP. Edit settings or assign subscription plans."
      />

      <div className="flex gap-2">
        <input
          className={`${inputClass} max-w-sm`}
          placeholder="Search name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="button" variant="subtle" onClick={() => void list.refetch()}>
          Search
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Subscription</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-border/60 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
                </td>
                <td className="px-4 py-3">{t.userCount}</td>
                <td className="px-4 py-3">
                  {t.subscription ? (
                    <>
                      <StatusBadge status={t.subscription.status} />
                      <span className="ml-2 text-muted-foreground">{t.subscription.planName}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="subtle" type="button" onClick={() => setDetailId(t.id)}>
                    Details
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    type="button"
                    className="ml-1"
                    onClick={() => setEditTenant(t)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    className="ml-1"
                    onClick={() => setAssignTenant(t)}
                  >
                    Plan
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Tenant details</DialogTitle>
          {detail.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {detail.data?.data && (
            <div className="space-y-4 text-sm">
              <p>
                <span className="text-muted-foreground">Slug:</span>{" "}
                <span className="font-mono">{detail.data.data.slug}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Timezone:</span> {detail.data.data.timezone}
              </p>
              <p>
                <span className="text-muted-foreground">Currency:</span>{" "}
                {detail.data.data.baseCurrencyCode}
              </p>
              <p>
                <span className="text-muted-foreground">Products / warehouses / sales:</span>{" "}
                {detail.data.data.counts.products} / {detail.data.data.counts.warehouses} /{" "}
                {detail.data.data.counts.sales}
              </p>
              <div>
                <p className="mb-2 font-medium">Users</p>
                <ul className="space-y-1 text-muted-foreground">
                  {detail.data.data.users.map((u) => (
                    <li key={u.id}>
                      {u.displayName} ({u.email}) — {u.role}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTenant)} onOpenChange={(open) => !open && setEditTenant(null)}>
        <DialogContent>
          <DialogTitle>Edit tenant</DialogTitle>
          {editTenant && (
            <TenantEditForm
              tenant={editTenant}
              pending={patchTenant.isPending}
              onSubmit={(data) => patchTenant.mutate({ id: editTenant.id, ...data })}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignTenant)} onOpenChange={(open) => !open && setAssignTenant(null)}>
        <DialogContent>
          <DialogTitle>Assign plan</DialogTitle>
          <DialogDescription>
            Replaces the active subscription for {assignTenant?.name}.
          </DialogDescription>
          {assignTenant && (
            <AssignPlanForm
              plans={plans.data?.data ?? []}
              pending={assignPlan.isPending}
              onSubmit={(planSlug) => assignPlan.mutate({ id: assignTenant.id, planSlug })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TenantEditForm({
  tenant,
  pending,
  onSubmit,
}: {
  tenant: TenantListItem;
  pending: boolean;
  onSubmit: (data: { name: string; timezone: string; baseCurrencyCode: string }) => void;
}): ReactElement {
  const [name, setName] = useState(tenant.name);
  const [timezone, setTimezone] = useState(tenant.timezone);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(tenant.baseCurrencyCode);

  return (
    <form
      className="space-y-3 pt-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit({ name, timezone, baseCurrencyCode });
      }}
    >
      <label className="block text-sm">
        <span className={labelClass}>Name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Timezone</span>
        <input
          className={inputClass}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Base currency</span>
        <input
          className={inputClass}
          maxLength={3}
          value={baseCurrencyCode}
          onChange={(e) => setBaseCurrencyCode(e.target.value.toUpperCase())}
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function AssignPlanForm({
  plans,
  pending,
  onSubmit,
}: {
  plans: { slug: string; name: string }[];
  pending: boolean;
  onSubmit: (planSlug: string) => void;
}): ReactElement {
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");

  return (
    <form
      className="space-y-3 pt-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(planSlug);
      }}
    >
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
      <Button type="submit" disabled={pending || !planSlug}>
        {pending ? "Assigning…" : "Assign plan"}
      </Button>
    </form>
  );
}
