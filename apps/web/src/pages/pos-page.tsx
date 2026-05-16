import type { FormEvent, ReactElement } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { drainPosQueue, enqueuePosCheckout } from "@/lib/offline-queue";

interface ProductRow {
  id: string;
  sku: string;
  name: string;
}

interface ProductsResponse {
  data: ProductRow[];
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

export function PosPage(): ReactElement {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("10.00");
  const [status, setStatus] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<ProductsResponse>("/v1/inventory/products"),
  });

  useEffect(() => {
    const onOnline = (): void => {
      void (async () => {
        await drainPosQueue(async (record) => {
          const body = JSON.parse(record.payload) as CheckoutBody;
          await apiFetch("/v1/pos/checkout", { method: "POST", body: JSON.stringify(body) });
        });
        setStatus((s) => (s?.startsWith("Offline") ? "Replayed offline queue." : s));
      })();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const checkout = useMutation({
    mutationFn: async (body: CheckoutBody) =>
      apiFetch<{ data: { receiptNumber: string; totalAmount: string } }>("/v1/pos/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      setStatus(`Completed ${res.data.receiptNumber} · ${res.data.totalAmount}`);
    },
    onError: async (err: unknown, body: CheckoutBody) => {
      const network = !navigator.onLine || err instanceof TypeError;
      if (network) {
        await enqueuePosCheckout(body);
        setStatus("Offline queue: checkout will sync when connectivity returns.");
        return;
      }
      setStatus(err instanceof Error ? err.message : "Checkout failed.");
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!productId) return;
    const subtotal = (Number(price) * Number(qty)).toFixed(2);
    const body: CheckoutBody = {
      currencyCode: "USD",
      lines: [
        {
          productId,
          quantity: qty,
          unitPrice: price,
          taxRatePercent: "0",
        },
      ],
      payments: [{ method: "CASH", amount: subtotal }],
    };
    checkout.mutate(body);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="space-y-4 rounded-xl border border-border bg-card p-4"
        onSubmit={onSubmit}
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="product">
            Product
          </label>
          <select
            id="product"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select…</option>
            {(products.data?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="qty">
              Qty
            </label>
            <input
              id="qty"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="price">
              Unit price
            </label>
            <input
              id="price"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={checkout.isPending}>
            Checkout (Enter)
          </Button>
          <span className="text-xs text-muted-foreground">
            Barcode mode: focus SKU field first, then quantity.
          </span>
        </div>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </form>
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Offline-first</p>
        <p className="mt-2">
          When the API rejects (e.g., network loss), the cart payload is persisted to IndexedDB and
          replayed automatically on reconnect.
        </p>
        <p className="mt-2 text-xs">
          ESC/POS helpers are available at{" "}
          <code className="font-mono">GET /v1/pos/receipt/:id/escpos</code>.
        </p>
      </div>
    </div>
  );
}
