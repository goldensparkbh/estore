import type { FormEvent, ReactElement } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  PackagePlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  isVirtual: boolean;
  addressLine: string | null;
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  defaultValuation: "FIFO" | "LIFO";
  isActive: boolean;
  reorderPointQuantity: string | null;
}

interface StockBatchRow {
  id: string;
  quantityOnHand: string;
  lotNumber: string | null;
  unitCostAmount: string;
  currencyCode: string;
  receivedAt: string;
  expiresAt: string | null;
  product: { id: string; sku: string; name: string; barcode: string | null };
  warehouse: { id: string; name: string; code: string };
}

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

type Tab = "stock" | "products" | "warehouses" | "reorder";

interface ReorderRuleRow {
  id: string;
  product: { id: string; sku: string; name: string };
  warehouse: { id: string; code: string; name: string };
  minimumQuantity: string;
  reorderQuantity: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  onHand: string;
}

export function InventoryPage(): ReactElement {
  const [tab, setTab] = useState<Tab>("stock");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Inventory
        </p>
        <h1 className="text-xl font-semibold">Warehouses, products & stock</h1>
        <p className="text-sm text-muted-foreground">
          Receive new stock, transfer between warehouses, and keep a fully audited
          chain of movements.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-border p-1">
        {(
          [
            { id: "stock", label: "Stock" },
            { id: "products", label: "Products" },
            { id: "warehouses", label: "Warehouses" },
            { id: "reorder", label: "Reorder rules" },
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

      {tab === "warehouses" && <WarehousesTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "stock" && <StockTab />}
      {tab === "reorder" && <ReorderTab />}
    </div>
  );
}

function ReorderTab(): ReactElement {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ data: ProductRow[] }>("/v1/inventory/products"),
  });
  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch<{ data: WarehouseRow[] }>("/v1/inventory/warehouses"),
  });
  const rules = useQuery({
    queryKey: ["reorder-rules"],
    queryFn: () =>
      apiFetch<{ data: ReorderRuleRow[] }>("/v1/inventory/reorder-rules"),
  });

  const toggle = useMutation({
    mutationFn: (r: ReorderRuleRow) =>
      apiFetch(`/v1/inventory/reorder-rules/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !r.isActive }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reorder-rules"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/inventory/reorder-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reorder-rules"] }),
  });

  const lowCount = (rules.data?.data ?? []).filter((r) => {
    return r.isActive && Number(r.onHand) <= Number(r.minimumQuantity);
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          When on-hand stock reaches or drops below the minimum, a reorder is
          flagged.{" "}
          {lowCount > 0 && (
            <span className="font-medium text-amber-400">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {lowCount} low-stock alert{lowCount === 1 ? "" : "s"}.
            </span>
          )}
        </p>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> New rule
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Minimum</th>
              <th className="px-4 py-2 text-right">Reorder qty</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(rules.data?.data ?? []).map((r) => {
              const isLow =
                r.isActive && Number(r.onHand) <= Number(r.minimumQuantity);
              return (
                <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.product.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {r.product.sku}
                    </p>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {r.warehouse.code}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono ${
                      isLow ? "text-amber-400" : ""
                    }`}
                  >
                    {r.onHand}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.minimumQuantity}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.reorderQuantity}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {isLow ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Reorder
                      </span>
                    ) : r.isActive ? (
                      <span className="text-emerald-400">OK</span>
                    ) : (
                      <span className="text-muted-foreground">Paused</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => toggle.mutate(r)}
                    >
                      {r.isActive ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this reorder rule?"))
                          del.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rules.data?.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                  No reorder rules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ReorderRuleDialog
        open={creating}
        products={products.data?.data ?? []}
        warehouses={warehouses.data?.data ?? []}
        onClose={() => setCreating(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["reorder-rules"] })}
      />
    </div>
  );
}

function ReorderRuleDialog(props: {
  open: boolean;
  products: ProductRow[];
  warehouses: WarehouseRow[];
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [minimum, setMinimum] = useState("5");
  const [reorder, setReorder] = useState("20");

  const mut = useMutation({
    mutationFn: () =>
      apiFetch("/v1/inventory/reorder-rules", {
        method: "POST",
        body: JSON.stringify({
          productId,
          warehouseId,
          minimumQuantity: minimum,
          reorderQuantity: reorder,
        }),
      }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    mut.mutate();
  };

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>New reorder rule</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className={labelClass}>Product</label>
            <select
              className={inputClass}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {props.products
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Warehouse</label>
            <select
              className={inputClass}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {props.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Minimum quantity</label>
              <input
                className={`${inputClass} font-mono`}
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Reorder quantity</label>
              <input
                className={`${inputClass} font-mono`}
                value={reorder}
                onChange={(e) => setReorder(e.target.value)}
                required
              />
            </div>
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WarehousesTab(): ReactElement {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WarehouseRow | "new" | null>(null);

  const q = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch<{ data: WarehouseRow[] }>("/v1/inventory/warehouses"),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/inventory/warehouses/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["warehouses"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" /> New warehouse
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(q.data?.data ?? []).map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-2 font-mono text-xs">{w.code}</td>
                <td className="px-4 py-2 font-medium">{w.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {w.addressLine ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {w.isVirtual ? "Virtual" : "Physical"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setEditing(w)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete warehouse "${w.name}"?`))
                        del.mutate(w.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {q.data?.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No warehouses yet — add your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {del.isError && (
        <p className="text-sm text-red-400">{(del.error as Error).message}</p>
      )}
      <WarehouseDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["warehouses"] })}
      />
    </div>
  );
}

function WarehouseDialog(props: {
  value: WarehouseRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement | null {
  const isNew = props.value === "new";
  const initial = props.value === "new" ? null : props.value;
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? "");
  const [isVirtual, setIsVirtual] = useState(initial?.isVirtual ?? false);

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? apiFetch("/v1/inventory/warehouses", {
            method: "POST",
            body: JSON.stringify(body),
          })
        : apiFetch(`/v1/inventory/warehouses/${initial?.id}`, {
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
    mut.mutate({
      name,
      code: code.toUpperCase(),
      isVirtual,
      addressLine: addressLine || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{isNew ? "New warehouse" : `Edit ${initial?.name}`}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Name</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Code</label>
              <input
                className={`${inputClass} font-mono uppercase`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                disabled={!isNew}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Address</label>
            <input
              className={inputClass}
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isVirtual}
              onChange={(e) => setIsVirtual(e.target.checked)}
            />
            Virtual warehouse (no physical location)
          </label>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
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

function ProductsTab(): ReactElement {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [filter, setFilter] = useState("");

  const q = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ data: ProductRow[] }>("/v1/inventory/products"),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/inventory/products/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const rows = useMemo(() => {
    const all = q.data?.data ?? [];
    if (!filter.trim()) return all;
    const f = filter.toLowerCase();
    return all.filter(
      (p) =>
        p.sku.toLowerCase().includes(f) ||
        p.name.toLowerCase().includes(f) ||
        (p.barcode ?? "").toLowerCase().includes(f),
    );
  }, [q.data?.data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search SKU, name, barcode…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" /> New product
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Barcode</th>
              <th className="px-4 py-2">Valuation</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {p.barcode ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs">{p.defaultValuation}</td>
                <td className="px-4 py-2 text-xs">
                  {p.isActive ? (
                    <span className="text-emerald-400">Active</span>
                  ) : (
                    <span className="text-muted-foreground">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setEditing(p)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {p.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Disable product "${p.name}"?`))
                          del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {q.data?.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ProductDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["products"] })}
      />
    </div>
  );
}

function ProductDialog(props: {
  value: ProductRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement | null {
  const isNew = props.value === "new";
  const initial = props.value === "new" ? null : props.value;
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [valuation, setValuation] = useState<"FIFO" | "LIFO">(
    initial?.defaultValuation ?? "FIFO",
  );

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? apiFetch("/v1/inventory/products", {
            method: "POST",
            body: JSON.stringify(body),
          })
        : apiFetch(`/v1/inventory/products/${initial?.id}`, {
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
    mut.mutate({
      sku,
      name,
      description: description || undefined,
      barcode: barcode || undefined,
      defaultValuation: valuation,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{isNew ? "New product" : `Edit ${initial?.name}`}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>SKU</label>
              <input
                className={`${inputClass} font-mono`}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                disabled={!isNew}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Valuation</label>
              <select
                className={inputClass}
                value={valuation}
                onChange={(e) =>
                  setValuation(e.target.value as "FIFO" | "LIFO")
                }
              >
                <option value="FIFO">FIFO</option>
                <option value="LIFO">LIFO</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Barcode</label>
            <input
              className={`${inputClass} font-mono`}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
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

function StockTab(): ReactElement {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<StockBatchRow | null>(null);

  const whQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch<{ data: WarehouseRow[] }>("/v1/inventory/warehouses"),
  });

  const prodQ = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ data: ProductRow[] }>("/v1/inventory/products"),
  });

  const batches = useQuery({
    queryKey: ["stock-batches", warehouseId],
    queryFn: () =>
      apiFetch<{ data: StockBatchRow[] }>(
        `/v1/inventory/stock-batches${warehouseId ? `?warehouseId=${warehouseId}` : ""}`,
      ),
  });

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ["stock-batches"] });
  };

  const warehouses = whQ.data?.data ?? [];
  const products = prodQ.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          className={`${inputClass} max-w-xs`}
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button type="button" onClick={() => setReceiveOpen(true)}>
            <PackagePlus className="mr-1 h-4 w-4" /> Receive
          </Button>
          <Button
            type="button"
            variant="subtle"
            onClick={() => setTransferOpen(true)}
            disabled={warehouses.length < 2}
            title={warehouses.length < 2 ? "Add a second warehouse to transfer" : ""}
          >
            <ArrowRightLeft className="mr-1 h-4 w-4" /> Transfer
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Lot</th>
              <th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Unit cost</th>
              <th className="px-4 py-2">Received</th>
              <th className="px-4 py-2 text-right">Adjust</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {batches.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {(batches.data?.data ?? []).map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2 font-mono text-xs">{b.product.sku}</td>
                <td className="px-4 py-2">{b.product.name}</td>
                <td className="px-4 py-2 text-xs">{b.warehouse.code}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {b.lotNumber ?? "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {b.quantityOnHand}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {b.currencyCode} {b.unitCostAmount}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(b.receivedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setAdjustOpen(b)}
                  >
                    <Boxes className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {batches.data?.data?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-muted-foreground">
                  No stock yet — click Receive to add inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReceiveDialog
        open={receiveOpen}
        warehouses={warehouses}
        products={products}
        onClose={() => setReceiveOpen(false)}
        onSaved={refresh}
      />
      <TransferDialog
        open={transferOpen}
        warehouses={warehouses}
        batches={batches.data?.data ?? []}
        onClose={() => setTransferOpen(false)}
        onSaved={refresh}
      />
      <AdjustDialog
        batch={adjustOpen}
        onClose={() => setAdjustOpen(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function ReceiveDialog(props: {
  open: boolean;
  warehouses: WarehouseRow[];
  products: ProductRow[];
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [lotNumber, setLotNumber] = useState("");

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/v1/inventory/receive", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
      setQuantity("1");
      setLotNumber("");
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    mut.mutate({
      productId,
      warehouseId,
      quantity,
      unitCostAmount: unitCost,
      currencyCode: currency,
      lotNumber: lotNumber || undefined,
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Receive stock</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className={labelClass}>Product</label>
            <select
              className={inputClass}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {props.products
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Warehouse</label>
            <select
              className={inputClass}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {props.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Quantity</label>
              <input
                className={`${inputClass} font-mono`}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Unit cost</label>
              <input
                className={`${inputClass} font-mono`}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Currency</label>
              <input
                className={`${inputClass} font-mono`}
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Lot number (optional)</label>
            <input
              className={`${inputClass} font-mono`}
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
            />
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Receive
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog(props: {
  open: boolean;
  warehouses: WarehouseRow[];
  batches: StockBatchRow[];
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const filteredBatches = props.batches.filter(
    (b) => !fromId || b.warehouse.id === fromId,
  );

  const mut = useMutation({
    mutationFn: () =>
      apiFetch("/v1/inventory/transfer", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          lines: [{ stockBatchId: batchId, quantity }],
        }),
      }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    mut.mutate();
  };

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Transfer stock</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>From</label>
              <select
                className={inputClass}
                value={fromId}
                onChange={(e) => {
                  setFromId(e.target.value);
                  setBatchId("");
                }}
                required
              >
                <option value="">Select…</option>
                {props.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>To</label>
              <select
                className={inputClass}
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {props.warehouses
                  .filter((w) => w.id !== fromId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Batch</label>
            <select
              className={inputClass}
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              required
              disabled={!fromId}
            >
              <option value="">Select…</option>
              {filteredBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.product.sku} — {b.product.name} (on hand {b.quantityOnHand})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Quantity</label>
            <input
              className={`${inputClass} font-mono`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Transfer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog(props: {
  batch: StockBatchRow | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement | null {
  const [type, setType] = useState<
    "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE" | "WASTAGE"
  >("ADJUSTMENT_INCREASE");
  const [delta, setDelta] = useState("1");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiFetch("/v1/inventory/adjust", {
        method: "POST",
        body: JSON.stringify({
          stockBatchId: props.batch?.id,
          quantityDelta: delta,
          reason,
          type,
        }),
      }),
    onSuccess: () => {
      props.onSaved();
      props.onClose();
    },
  });

  if (!props.batch) return null;

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    mut.mutate();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Adjust stock</DialogTitle>
        <p className="text-xs text-muted-foreground">
          {props.batch.product.sku} · {props.batch.product.name} ·{" "}
          {props.batch.warehouse.code} (on hand {props.batch.quantityOnHand})
        </p>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className={labelClass}>Type</label>
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="ADJUSTMENT_INCREASE">Increase (found stock)</option>
              <option value="ADJUSTMENT_DECREASE">Decrease (correction)</option>
              <option value="WASTAGE">Wastage / damaged</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Quantity</label>
            <input
              className={`${inputClass} font-mono`}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Reason</label>
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Save adjustment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
