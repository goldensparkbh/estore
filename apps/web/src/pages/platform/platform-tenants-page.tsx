import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import { adminDownloadCsv } from "@/lib/admin-download";
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

export function PlatformTenantsPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);

  const list = useQuery({
    queryKey: ["admin-tenants", search],
    queryFn: () => {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      return adminApiFetch<{ data: TenantListItem[] }>(`/v1/admin/tenants${qs}`);
    },
  });

  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () =>
      adminApiFetch<{ data: { slug: string; name: string }[] }>("/v1/admin/plans"),
  });

  const createTenant = useMutation({
    mutationFn: (body: Record<string, string>) =>
      adminApiFetch("/v1/admin/tenants", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      setShowCreate(false);
    },
  });

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Tenants"
        description="Create and manage customer organizations, users, and workspace access."
        actions={
          <>
            <Button
              type="button"
              variant="subtle"
              disabled={exporting}
              onClick={() => {
                setExporting(true);
                void adminDownloadCsv("/v1/admin/export/tenants", "tenants.csv").finally(() =>
                  setExporting(false),
                );
              }}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button type="button" onClick={() => setShowCreate(true)}>
              New tenant
            </Button>
          </>
        }
      />

      <section className="flex gap-2">
        <input
          className={`${inputClass} max-w-sm`}
          placeholder="Search name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="button" variant="subtle" onClick={() => void list.refetch()}>
          Search
        </Button>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {list.isError && <p className="p-4 text-sm text-red-400">{(list.error as Error).message}</p>}
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Subscription</th>
              <th className="px-4 py-3">Status</th>
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
                <td className="px-4 py-3">
                  {t.isSuspended ? (
                    <span className="text-xs font-medium text-amber-400">Suspended</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" type="button" asChild>
                    <Link to={`/platform/tenants/${t.id}`}>Manage</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>Create tenant</DialogTitle>
          <DialogDescription>
            Provisions a new organization with an owner account and subscription plan.
          </DialogDescription>
          <CreateTenantForm
            plans={plans.data?.data ?? []}
            pending={createTenant.isPending}
            error={createTenant.isError ? (createTenant.error as Error).message : null}
            onSubmit={(body) => createTenant.mutate(body)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CreateTenantForm({
  plans,
  pending,
  error,
  onSubmit,
}: {
  plans: { slug: string; name: string }[];
  pending: boolean;
  error: string | null;
  onSubmit: (body: Record<string, string>) => void;
}): ReactElement {
  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "free");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  return (
    <form
      className="space-y-3 pt-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit({
          organizationName,
          ...(slug.trim() ? { slug: slug.trim() } : {}),
          planSlug,
          ownerEmail,
          ownerPassword,
          ownerDisplayName: ownerDisplayName || organizationName,
          timezone,
        });
      }}
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      <label className="block text-sm">
        <span className={labelClass}>Organization name</span>
        <input
          className={inputClass}
          required
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Slug (optional)</span>
        <input
          className={inputClass}
          placeholder="auto-generated"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
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
        <span className={labelClass}>Owner email</span>
        <input
          type="email"
          required
          className={inputClass}
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Owner password</span>
        <input
          type="password"
          required
          minLength={10}
          className={inputClass}
          value={ownerPassword}
          onChange={(e) => setOwnerPassword(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Owner display name</span>
        <input
          className={inputClass}
          value={ownerDisplayName}
          onChange={(e) => setOwnerDisplayName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Timezone</span>
        <input className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create tenant"}
      </Button>
    </form>
  );
}
