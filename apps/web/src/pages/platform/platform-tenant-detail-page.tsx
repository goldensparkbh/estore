import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
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
  isSuspended: boolean;
  createdAt: string;
  counts: { products: number; warehouses: number; sales: number };
  users: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    isActive: boolean;
  }[];
  subscriptions: { id: string; status: string; plan: { name: string; slug: string } }[];
}

export function PlatformTenantDetailPage(): ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userDialog, setUserDialog] = useState<"new" | string | null>(null);
  const [deleteSlug, setDeleteSlug] = useState("");

  const detail = useQuery({
    queryKey: ["admin-tenant", tenantId],
    queryFn: () => adminApiFetch<{ data: TenantDetail }>(`/v1/admin/tenants/${tenantId}`),
    enabled: Boolean(tenantId),
  });

  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () =>
      adminApiFetch<{ data: { slug: string; name: string }[] }>("/v1/admin/plans"),
  });

  const t = detail.data?.data;

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [suspended, setSuspended] = useState(false);
  const [planSlug, setPlanSlug] = useState("");

  useEffect(() => {
    if (!t) return;
    setName(t.name);
    setTimezone(t.timezone);
    setCurrency(t.baseCurrencyCode);
    setSuspended(t.isSuspended);
    setPlanSlug(t.subscriptions[0]?.plan.slug ?? plans.data?.data[0]?.slug ?? "");
  }, [t, plans.data?.data]);

  const saveTenant = useMutation({
    mutationFn: () =>
      adminApiFetch(`/v1/admin/tenants/${tenantId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          timezone,
          baseCurrencyCode: currency,
          isSuspended: suspended,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] }),
  });

  const assignPlan = useMutation({
    mutationFn: () =>
      adminApiFetch(`/v1/admin/tenants/${tenantId}/assign-plan`, {
        method: "POST",
        body: JSON.stringify({ planSlug }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] }),
  });

  const deleteTenant = useMutation({
    mutationFn: () =>
      adminApiFetch(`/v1/admin/tenants/${tenantId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmSlug: deleteSlug }),
      }),
    onSuccess: () => navigate("/platform/tenants"),
  });

  if (!tenantId) {
    return <p className="text-sm text-muted-foreground">Missing tenant ID.</p>;
  }

  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title={t?.name ?? "Tenant"}
        description={t ? `Slug: ${t.slug}` : "Loading…"}
        actions={
          <Button variant="subtle" type="button" asChild>
            <Link to="/platform/tenants">← All tenants</Link>
          </Button>
        }
      />

      {detail.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {detail.isError && (
        <p className="text-sm text-red-400">{(detail.error as Error).message}</p>
      )}

      {t && (
        <>
          <form
            className="space-y-4 rounded-xl border border-border bg-card p-6"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void saveTenant.mutate();
            }}
          >
            <h2 className="text-sm font-semibold">Organization settings</h2>
            {t.isSuspended && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                This tenant is suspended — users cannot access the workspace.
              </p>
            )}
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
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={suspended}
                onChange={(e) => setSuspended(e.target.checked)}
              />
              Suspend workspace (blocks tenant API access)
            </label>
            <Button type="submit" disabled={saveTenant.isPending}>
              {saveTenant.isPending ? "Saving…" : "Save settings"}
            </Button>
          </form>

          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Subscription</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Products: {t.counts.products} · Warehouses: {t.counts.warehouses} · Sales:{" "}
              {t.counts.sales}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className={labelClass}>Plan</span>
                <select
                  className={inputClass}
                  value={planSlug}
                  onChange={(e) => setPlanSlug(e.target.value)}
                >
                  {(plans.data?.data ?? []).map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" onClick={() => void assignPlan.mutate()} disabled={assignPlan.isPending}>
                Assign plan
              </Button>
            </div>
            {t.subscriptions[0] && (
              <p className="mt-3 text-sm">
                Current: <StatusBadge status={t.subscriptions[0].status} />{" "}
                {t.subscriptions[0].plan.name}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <header className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold">Users</h2>
              <Button size="sm" type="button" onClick={() => setUserDialog("new")}>
                Add user
              </Button>
            </header>
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {t.users.map((u) => (
                  <tr key={u.id} className="border-t border-border/60">
                    <td className="py-2">{u.displayName}</td>
                    <td className="py-2 text-muted-foreground">{u.email}</td>
                    <td className="py-2">{u.role}</td>
                    <td className="py-2">{u.isActive ? "Active" : "Disabled"}</td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="subtle" type="button" onClick={() => setUserDialog(u.id)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl border border-red-500/30 bg-card p-6">
            <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently deletes the tenant and all data. Type the slug to confirm.
            </p>
            <input
              className={`${inputClass} mt-3 max-w-xs`}
              placeholder={t.slug}
              value={deleteSlug}
              onChange={(e) => setDeleteSlug(e.target.value)}
            />
            <Button
              type="button"
              className="mt-3"
              variant="default"
              disabled={deleteTenant.isPending || deleteSlug !== t.slug}
              onClick={() => {
                if (window.confirm(`Delete tenant "${t.name}" forever?`)) {
                  void deleteTenant.mutate();
                }
              }}
            >
              Delete tenant
            </Button>
          </section>
        </>
      )}

      <UserFormDialog
        key={userDialog ?? "closed"}
        tenantId={tenantId}
        userId={userDialog === "new" ? null : userDialog}
        open={userDialog !== null}
        onClose={() => setUserDialog(null)}
        existing={userDialog && userDialog !== "new" ? t?.users.find((u) => u.id === userDialog) : undefined}
      />
    </section>
  );
}

function UserFormDialog({
  tenantId,
  userId,
  open,
  onClose,
  existing,
}: {
  tenantId: string;
  userId: string | null;
  open: boolean;
  onClose: () => void;
  existing?: { email: string; displayName: string; role: string; isActive: boolean };
}): ReactElement {
  const qc = useQueryClient();
  const isNew = !userId || userId === "new";
  const [email, setEmail] = useState(existing?.email ?? "");
  const [displayName, setDisplayName] = useState(existing?.displayName ?? "");
  const [role, setRole] = useState(existing?.role ?? "MEMBER");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        return adminApiFetch(`/v1/admin/tenants/${tenantId}/users`, {
          method: "POST",
          body: JSON.stringify({ email, displayName, password, role }),
        });
      }
      return adminApiFetch(`/v1/admin/tenants/${tenantId}/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          role,
          isActive,
          ...(password ? { password } : {}),
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      onClose();
    },
  });

  const deactivate = useMutation({
    mutationFn: () =>
      adminApiFetch(`/v1/admin/tenants/${tenantId}/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{isNew ? "Add user" : "Edit user"}</DialogTitle>
        <form
          className="space-y-3 pt-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save.mutate();
          }}
        >
          {isNew && (
            <label className="block text-sm">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                required
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm">
            <span className={labelClass}>Display name</span>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className={labelClass}>Role</span>
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
            </select>
          </label>
          {!isNew && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          )}
          <label className="block text-sm">
            <span className={labelClass}>{isNew ? "Password" : "New password (optional)"}</span>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={isNew}
              minLength={10}
            />
          </label>
          <footer className="flex justify-between gap-2 pt-2">
            {!isNew && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void deactivate.mutate()}
                disabled={deactivate.isPending}
              >
                Deactivate
              </Button>
            )}
            <Button type="submit" className="ml-auto" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
