import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreCarousel } from "@/components/store/store-carousel";
import { StoreContactForm } from "@/components/store/store-contact-form";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreNavbar } from "@/components/store/store-navbar";
import { StoreThemeEffect } from "@/components/theme-sync";
import { publicFetch, type Storefront, type StoreProduct } from "@/lib/store-public";

export function StoreLandingPage(): ReactElement {
  const { slug = "" } = useParams();

  const store = useQuery({
    queryKey: ["store", slug],
    queryFn: () => publicFetch<{ data: Storefront }>(`/v1/store/${slug}`),
    enabled: Boolean(slug),
  });

  const latest = useQuery({
    queryKey: ["store-latest", slug],
    queryFn: () =>
      publicFetch<{
        data: { currencyCode: string; products: StoreProduct[] };
      }>(`/v1/store/${slug}/products?sort=latest&limit=8`),
    enabled: Boolean(slug) && store.isSuccess,
  });

  if (store.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading store…
      </div>
    );
  }

  if (store.isError || !store.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-lg font-semibold">Store not found</p>
        <Link to="/" className="text-sm text-primary hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const s = store.data.data;
  const products = latest.data?.data.products ?? [];
  const currency = latest.data?.data.currencyCode ?? s.baseCurrencyCode;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StoreThemeEffect uiTheme={s.uiTheme} />
      <StoreNavbar store={s} slug={slug} active="home" />
      <StoreCarousel images={s.storeCarouselImages} headline={s.storeHeadline} />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary">New arrivals</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Latest products</h2>
            </div>
            <Button variant="subtle" asChild>
              <Link to={`/store/${slug}/shop`}>
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {latest.isLoading && (
            <p className="mt-8 text-sm text-muted-foreground">Loading products…</p>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/store/${slug}/shop`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/40"
              >
                <div className="aspect-square bg-muted/40">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {p.category && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.category}
                    </p>
                  )}
                  <h3 className="mt-1 font-semibold">{p.name}</h3>
                  <p className="mt-2 text-lg font-bold">
                    {currency} {Number(p.retailPrice ?? 0).toFixed(2)}
                  </p>
                  {!p.inStock && (
                    <p className="mt-1 text-xs text-amber-400">Out of stock</p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {!latest.isLoading && products.length === 0 && (
            <p className="mt-8 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
              No products in the store yet. Check back soon.
            </p>
          )}
        </section>

        <section id="contact" className="border-t border-border bg-muted/20 py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 text-center">
              <p className="text-xs uppercase tracking-widest text-primary">Get in touch</p>
              <h2 className="mt-1 text-2xl font-bold">Contact us</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Questions about an order or our products? Send us a message.
              </p>
            </div>
            <StoreContactForm slug={slug} />
          </div>
        </section>
      </main>

      <StoreFooter store={s} slug={slug} />
    </div>
  );
}
