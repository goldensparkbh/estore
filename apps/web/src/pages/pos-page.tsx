import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { drainPosQueue, enqueuePosCheckout } from "@/lib/offline-queue";

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  retailPrice: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

interface RecentSale {
  id: string;
  receiptNumber: string;
  totalAmount: string;
  currencyCode: string;
  createdAt: string;
}

interface CartLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
}

interface CheckoutBody {
  currencyCode: string;
  lines: Array<{
    productId: string;
    quantity: string;
    unitPrice: string;
    taxRatePercent: string;
    discountAmount?: string;
  }>;
  payments: Array<{ method: "CASH" | "CARD" | "WALLET" | "OTHER"; amount: string }>;
}

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function PosPage(): ReactElement {
  const qc = useQueryClient();
  const tenantId = useSessionStore((s) => s.tenantId);
  const userId = useSessionStore((s) => s.userId);
  const [filter, setFilter] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [defaultTax, setDefaultTax] = useState("0");
  const [defaultPrice, setDefaultPrice] = useState("10.00");
  const [currency, setCurrency] = useState("USD");
  const [method, setMethod] = useState<"CASH" | "CARD" | "WALLET" | "OTHER">("CASH");
  const [status, setStatus] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ data: ProductRow[] }>("/v1/inventory/products"),
  });

  const recent = useQuery({
    queryKey: ["pos", "recent"],
    queryFn: () =>
      apiFetch<{ data: RecentSale[] }>("/v1/pos/sales/recent"),
  });

  useEffect(() => {
    const onOnline = (): void => {
      void (async () => {
        await drainPosQueue(async (record) => {
          const body = JSON.parse(record.payload) as CheckoutBody;
          await apiFetch("/v1/pos/checkout", {
            method: "POST",
            body: JSON.stringify(body),
          });
        });
        setStatus((s) =>
          s?.startsWith("Offline") ? "Replayed offline queue." : s,
        );
      })();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const filtered = useMemo(() => {
    const all = (products.data?.data ?? []).filter((p) => p.isActive);
    if (!filter.trim()) return all.slice(0, 30);
    const f = filter.toLowerCase();
    return all
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(f) ||
          p.name.toLowerCase().includes(f) ||
          (p.barcode ?? "").toLowerCase().includes(f),
      )
      .slice(0, 30);
  }, [products.data?.data, filter]);

  const addToCart = (p: ProductRow): void => {
    setCart((c) => {
      const existing = c.find((l) => l.productId === p.id);
      if (existing) {
        return c.map((l) =>
          l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...c,
        {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          quantity: 1,
          unitPrice: Number(p.retailPrice ?? defaultPrice) || 0,
          taxRatePercent: Number(defaultTax) || 0,
        },
      ];
    });
  };

  const updateLine = (productId: string, patch: Partial<CartLine>): void => {
    setCart((c) =>
      c.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    );
  };

  const removeLine = (productId: string): void => {
    setCart((c) => c.filter((l) => l.productId !== productId));
  };

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const tax = cart.reduce(
    (s, l) => s + (l.unitPrice * l.quantity * l.taxRatePercent) / 100,
    0,
  );
  const total = subtotal + tax;

  const checkout = useMutation({
    mutationFn: async (body: CheckoutBody) =>
      apiFetch<{ data: { receiptNumber: string; totalAmount: string } }>(
        "/v1/pos/checkout",
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: (res) => {
      setStatus(`Sale complete · ${res.data.receiptNumber}`);
      setLastReceipt(res.data.receiptNumber);
      setCart([]);
      void qc.invalidateQueries({ queryKey: ["pos", "recent"] });
    },
    onError: async (err: unknown, body: CheckoutBody) => {
      const network = !navigator.onLine || err instanceof TypeError;
      if (network) {
        await enqueuePosCheckout(body);
        setStatus("Offline: queued and will sync on reconnect.");
        setCart([]);
        return;
      }
      setStatus(err instanceof Error ? err.message : "Checkout failed.");
    },
  });

  const onCheckout = (e: FormEvent): void => {
    e.preventDefault();
    if (cart.length === 0) return;
    const body: CheckoutBody = {
      currencyCode: currency,
      lines: cart.map((l) => ({
        productId: l.productId,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toFixed(2),
        taxRatePercent: l.taxRatePercent.toFixed(4),
      })),
      payments: [{ method, amount: total.toFixed(2) }],
    };
    checkout.mutate(body);
  };

  const openReceiptHtml = (receiptNumber: string): void => {
    const url = `/v1/pos/receipt/${encodeURIComponent(receiptNumber)}/html`;
    const tokenParams = new URLSearchParams({ tenantId, userId });
    fetch(url, {
      headers: { "x-tenant-id": tenantId, "x-user-id": userId },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const win = window.open("", "_blank", "width=420,height=640");
        if (win) {
          win.document.open();
          win.document.write(html);
          win.document.close();
        }
      })
      .catch((err) => {
        console.error("receipt fetch failed", err, tokenParams.toString());
        setStatus("Unable to fetch receipt.");
      });
  };

  return (
    <div className="touch-manipulation lg:-mx-4 lg:-my-2">
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <h1 className="text-lg font-semibold">Point of Sale</h1>
        <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-mono text-primary">
          {currency} {total.toFixed(2)}
        </span>
      </div>
      <div className="grid min-h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col space-y-4">
        <div className="flex-1 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              autoFocus
              className={`${inputClass} h-12 text-base`}
              placeholder="Scan barcode or search…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered.length === 1) {
                  addToCart(filtered[0]);
                  setFilter("");
                }
              }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4 max-h-[50vh] lg:max-h-none lg:flex-1">
            {products.isLoading && (
              <p className="col-span-full text-sm text-muted-foreground">Loading…</p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                className="flex min-h-[120px] flex-col overflow-hidden rounded-xl border border-border bg-background text-left transition active:scale-[0.98] hover:border-primary/40 active:bg-muted/30"
              >
                <div className="aspect-[4/3] w-full bg-muted/40">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                      {p.sku}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <span className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</span>
                  <span className="mt-auto pt-2 font-mono text-sm text-primary">
                    {currency} {Number(p.retailPrice ?? defaultPrice).toFixed(2)}
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && !products.isLoading && (
              <p className="col-span-full text-sm text-muted-foreground">
                No products match. Add some in Inventory → Products.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Recent sales</p>
          </div>
          <div className="divide-y divide-border">
            {(recent.data?.data ?? []).slice(0, 8).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <div>
                  <p className="font-mono text-xs">{s.receiptNumber}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">
                    {s.currencyCode} {Number(s.totalAmount).toFixed(2)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => openReceiptHtml(s.receiptNumber)}
                  >
                    <Printer className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {recent.data?.data?.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                No sales yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <form
        className="sticky top-4 flex flex-col space-y-3 rounded-xl border border-border bg-card p-4 lg:max-h-[calc(100vh-6rem)]"
        onSubmit={onCheckout}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Cart ({cart.length})</h2>
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase text-muted-foreground">
              Default ¤
            </label>
            <input
              className={`${inputClass} w-16 font-mono`}
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
            <label className="text-[10px] uppercase text-muted-foreground">
              Tax %
            </label>
            <input
              className={`${inputClass} w-16 font-mono`}
              value={defaultTax}
              onChange={(e) => setDefaultTax(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {cart.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Cart is empty. Scan a barcode or click a product.
            </p>
          )}
          {cart.map((l) => (
            <div key={l.productId} className="grid grid-cols-12 gap-2 px-3 py-2">
              <div className="col-span-5">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {l.sku}
                </p>
              </div>
              <div className="col-span-3 flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    updateLine(l.productId, {
                      quantity: Math.max(1, l.quantity - 1),
                    })
                  }
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <input
                  className={`${inputClass} h-8 text-center font-mono`}
                  value={l.quantity}
                  onChange={(e) =>
                    updateLine(l.productId, {
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    updateLine(l.productId, { quantity: l.quantity + 1 })
                  }
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <input
                className={`${inputClass} col-span-3 font-mono`}
                value={l.unitPrice}
                onChange={(e) =>
                  updateLine(l.productId, {
                    unitPrice: Number(e.target.value) || 0,
                  })
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="col-span-1"
                onClick={() => removeLine(l.productId)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <label className={labelClass}>Currency</label>
            <input
              className={`${inputClass} font-mono`}
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Payment method</label>
            <select
              className={inputClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="WALLET">Wallet</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="space-y-1 rounded-md bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">{currency} {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-mono">{currency} {tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono">{currency} {total.toFixed(2)}</span>
          </div>
        </div>

        <Button
          type="submit"
          className="h-14 w-full text-lg"
          disabled={checkout.isPending || cart.length === 0}
        >
          {checkout.isPending ? "Processing…" : `Charge ${currency} ${total.toFixed(2)}`}
        </Button>
        {status && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">{status}</p>
            {lastReceipt && (
              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={() => openReceiptHtml(lastReceipt)}
              >
                <Printer className="mr-1 h-3 w-3" /> Print last
              </Button>
            )}
          </div>
        )}
      </form>
      </div>
    </div>
  );
}
