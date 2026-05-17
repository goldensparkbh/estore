import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import { adminDownloadCsv } from "@/lib/admin-download";
import type { PlanFeatures, PlatformPlan } from "@/lib/platform-types";
import { inputClass, labelClass } from "@/lib/platform-types";
import { PageHeader } from "@/components/platform/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const defaultFeatures: PlanFeatures = {
  modules: { inventory: true, pos: true, hr: false },
  maxWarehouses: 5,
  maxProducts: 1000,
  maxUsers: 10,
};

export function PlatformPlansPage(): ReactElement {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<PlatformPlan | null | "new">(null);
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: ["admin-plans", showInactive],
    queryFn: () =>
      adminApiFetch<{ data: PlatformPlan[] }>(
        `/v1/admin/plans${showInactive ? "?includeInactive=true" : ""}`,
      ),
  });

  const savePlan = useMutation({
    mutationFn: (body: Record<string, unknown> & { id?: string }) => {
      if (body.id) {
        const { id, ...rest } = body;
        return adminApiFetch(`/v1/admin/plans/${id}`, {
          method: "PATCH",
          body: JSON.stringify(rest),
        });
      }
      return adminApiFetch("/v1/admin/plans", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setEditor(null);
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/v1/admin/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-plans"] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Subscription plans"
        description="Create and edit plans shown on the marketing site and tenant billing."
        actions={
          <>
            <Button
              type="button"
              variant="subtle"
              disabled={exporting}
              onClick={() => {
                setExporting(true);
                void adminDownloadCsv("/v1/admin/export/plans", "plans.csv").finally(() =>
                  setExporting(false),
                );
              }}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button type="button" onClick={() => setEditor("new")}>
              New plan
            </Button>
          </>
        }
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Show inactive plans
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        {(q.data?.data ?? []).map((plan) => (
          <article
            key={plan.id}
            className={`rounded-xl border bg-card p-5 ${plan.isActive ? "border-border" : "border-dashed border-muted opacity-75"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="font-mono text-xs text-muted-foreground">{plan.slug}</p>
              </div>
              {!plan.isActive && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Inactive</span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{plan.description ?? "—"}</p>
            <p className="mt-3 text-lg font-semibold tabular-nums">
              {plan.isFreeTier
                ? "Free"
                : `${plan.currencyCode} ${plan.priceAmount}${plan.billingInterval ? ` / ${plan.billingInterval.toLowerCase()}` : ""}`}
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>
                Modules:{" "}
                {[
                  plan.features.modules.inventory && "Inventory",
                  plan.features.modules.pos && "POS",
                  plan.features.modules.hr && "HR",
                ]
                  .filter(Boolean)
                  .join(", ") || "None"}
              </li>
              <li>{plan.subscriptionCount} subscription(s)</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="subtle" type="button" onClick={() => setEditor(plan)}>
                Edit
              </Button>
              {plan.isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Deactivate plan "${plan.name}"?`)) {
                      void deactivate.mutate(plan.id);
                    }
                  }}
                >
                  Deactivate
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogTitle>{editor === "new" ? "Create plan" : "Edit plan"}</DialogTitle>
          <DialogDescription>
            Slug is used in URLs and API. Use lowercase letters, numbers, and hyphens.
          </DialogDescription>
          <PlanForm
            initial={editor === "new" ? null : editor}
            pending={savePlan.isPending}
            error={savePlan.isError ? (savePlan.error as Error).message : null}
            onSubmit={(body) => savePlan.mutate(body)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanForm({
  initial,
  pending,
  error,
  onSubmit,
}: {
  initial: PlatformPlan | null;
  pending: boolean;
  error: string | null;
  onSubmit: (body: Record<string, unknown> & { id?: string }) => void;
}): ReactElement {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceAmount, setPriceAmount] = useState(initial?.priceAmount ?? "0");
  const [currencyCode, setCurrencyCode] = useState(initial?.currencyCode ?? "USD");
  const [billingInterval, setBillingInterval] = useState(initial?.billingInterval ?? "");
  const [isFreeTier, setIsFreeTier] = useState(initial?.isFreeTier ?? false);
  const [trialDays, setTrialDays] = useState(String(initial?.trialDays ?? 0));
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [features, setFeatures] = useState<PlanFeatures>(initial?.features ?? defaultFeatures);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    onSubmit({
      ...(initial ? { id: initial.id } : {}),
      name,
      slug,
      description: description || null,
      priceAmount,
      currencyCode,
      billingInterval: billingInterval === "" ? null : billingInterval,
      isFreeTier,
      trialDays: Number(trialDays),
      sortOrder: Number(sortOrder),
      features,
      isActive: true,
    });
  };

  return (
    <form className="space-y-3 pt-2" onSubmit={handleSubmit}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <label className="block text-sm">
        <span className={labelClass}>Name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Slug</span>
        <input
          className={inputClass}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          disabled={Boolean(initial)}
        />
      </label>
      <label className="block text-sm">
        <span className={labelClass}>Description</span>
        <textarea
          className={`${inputClass} min-h-[72px]`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isFreeTier}
          onChange={(e) => setIsFreeTier(e.target.checked)}
        />
        Free tier
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={labelClass}>Price</span>
          <input
            className={inputClass}
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Currency</span>
          <input
            className={inputClass}
            maxLength={3}
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className={labelClass}>Billing interval</span>
        <select
          className={inputClass}
          value={billingInterval}
          onChange={(e) => setBillingInterval(e.target.value)}
        >
          <option value="">None (free / custom)</option>
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </label>
      <fieldset className="rounded-lg border border-border p-3 text-sm">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Modules</legend>
        {(["inventory", "pos", "hr"] as const).map((mod) => (
          <label key={mod} className="mr-4 inline-flex items-center gap-2 capitalize">
            <input
              type="checkbox"
              checked={features.modules[mod]}
              onChange={(e) =>
                setFeatures({
                  ...features,
                  modules: { ...features.modules, [mod]: e.target.checked },
                })
              }
            />
            {mod}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm">
          <span className={labelClass}>Max warehouses</span>
          <input
            type="number"
            className={inputClass}
            value={features.maxWarehouses ?? ""}
            onChange={(e) =>
              setFeatures({ ...features, maxWarehouses: Number(e.target.value) || undefined })
            }
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Max products</span>
          <input
            type="number"
            className={inputClass}
            value={features.maxProducts ?? ""}
            onChange={(e) =>
              setFeatures({ ...features, maxProducts: Number(e.target.value) || undefined })
            }
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Max users</span>
          <input
            type="number"
            className={inputClass}
            value={features.maxUsers ?? ""}
            onChange={(e) =>
              setFeatures({ ...features, maxUsers: Number(e.target.value) || undefined })
            }
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={labelClass}>Trial days</span>
          <input
            type="number"
            className={inputClass}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Sort order</span>
          <input
            type="number"
            className={inputClass}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </label>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : initial ? "Update plan" : "Create plan"}
      </Button>
    </form>
  );
}
