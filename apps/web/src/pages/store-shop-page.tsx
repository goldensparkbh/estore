import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StoreProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  retailPrice: string | null;
  imageUrl: string | null;
  inStock: boolean;
  stockOnHand: string;
}

interface CartLine {
  product: StoreProduct;
  quantity: number;
}

async function publicFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function StoreShopPage(): ReactElement {
  const { slug = "" } = useParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const products = useQuery({
    queryKey: ["store-products", slug, search, category],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      return publicFetch<{
        data: {
          currencyCode: string;
          categories: (string | null)[];
          products: StoreProduct[];
        };
      }>(`/v1/store/${slug}/products?${params.toString()}`);
    },
    enabled: Boolean(slug),
  });

  const filtered = useMemo(() => products.data?.data.products ?? [], [products.data]);

  const addToCart = (p: StoreProduct): void => {
    if (!p.inStock) return;
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id);
      if (existing) {
        return c.map((l) =>
          l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...c, { product: p, quantity: 1 }];
    });
  };

  const total = cart.reduce(
    (sum, l) => sum + Number(l.product.retailPrice ?? 0) * l.quantity,
    0,
  );

  const checkout = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/v1/store/${slug}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail,
          lines: cart.map((l) => ({
            productId: l.product.id,
            quantity: String(l.quantity),
          })),
        }),
      });
      const body = (await res.json()) as {
        detail?: string;
        title?: string;
        data?: { paymentUrl: string; order: { orderNumber: string } };
      };
      if (!res.ok) {
        throw new Error(body.detail ?? body.title ?? `Checkout failed (${res.status})`);
      }
      if (!body.data?.paymentUrl) {
        throw new Error("No payment URL returned from gateway.");
      }
      return body.data;
    },
    onSuccess: (data) => {
      setCheckoutOpen(false);
      window.location.href = data.paymentUrl;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to={`/store/${slug}`} className="font-semibold">
            Store
          </Link>
          <input
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="subtle" type="button" onClick={() => setCheckoutOpen(true)}>
            <ShoppingCart className="mr-1 h-4 w-4" />
            {cart.length} · {total.toFixed(2)}
          </Button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
          <FilterChip active={!category} label="All" onClick={() => setCategory("")} />
          {(products.data?.data.categories ?? []).map((c) =>
            c ? (
              <FilterChip
                key={c}
                active={category === c}
                label={c}
                onClick={() => setCategory(c)}
              />
            ) : null,
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => (
          <article
            key={p.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/40"
          >
            <div className="aspect-square bg-muted/40">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col p-4">
              {p.category && (
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {p.category}
                </p>
              )}
              <h2 className="mt-1 font-semibold">{p.name}</h2>
              <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted-foreground">
                {p.description ?? p.sku}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-bold">
                  {products.data?.data.currencyCode}{" "}
                  {Number(p.retailPrice ?? 0).toFixed(2)}
                </span>
                <Button
                  size="sm"
                  type="button"
                  disabled={!p.inStock}
                  onClick={() => addToCart(p)}
                >
                  {p.inStock ? "Add" : "Out of stock"}
                </Button>
              </div>
            </div>
          </article>
        ))}
        {filtered.length === 0 && !products.isLoading && (
          <p className="col-span-full py-12 text-center text-muted-foreground">
            No products match your filters.
          </p>
        )}
      </main>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl border border-border bg-card p-5 sm:rounded-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Checkout</h2>
              <button type="button" onClick={() => setCheckoutOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mb-4 max-h-40 space-y-2 overflow-y-auto text-sm">
              {cart.map((l) => (
                <li key={l.product.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{l.product.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded border border-border p-1"
                      onClick={() =>
                        setCart((c) =>
                          c
                            .map((x) =>
                              x.product.id === l.product.id
                                ? { ...x, quantity: x.quantity - 1 }
                                : x,
                            )
                            .filter((x) => x.quantity > 0),
                        )
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center font-mono">{l.quantity}</span>
                    <button
                      type="button"
                      className="rounded border border-border p-1"
                      onClick={() => addToCart(l.product)}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mb-4 text-right font-semibold">Total: {total.toFixed(2)}</p>
            <input
              className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Your name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            {checkout.isError && (
              <p className="mb-2 text-sm text-red-400">{(checkout.error as Error).message}</p>
            )}
            <Button
              className="w-full"
              type="button"
              disabled={cart.length === 0 || checkout.isPending || !customerName || !customerEmail}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? "Redirecting to payment…" : "Pay with card (TAP)"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip(props: {
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
        props.active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {props.label}
    </button>
  );
}
