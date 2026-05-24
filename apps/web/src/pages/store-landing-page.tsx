import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StoreInfo {
  data: {
    id: string;
    name: string;
    slug: string;
    storeHeadline: string | null;
    storeLogoUrl: string | null;
    baseCurrencyCode: string;
  };
}

async function publicFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function StoreLandingPage(): ReactElement {
  const { slug = "" } = useParams();

  const store = useQuery({
    queryKey: ["store", slug],
    queryFn: () => publicFetch<StoreInfo>(`/v1/store/${slug}`),
    enabled: Boolean(slug),
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {s.storeLogoUrl ? (
              <img src={s.storeLogoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                {s.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="font-semibold">{s.name}</span>
          </div>
          <Button asChild>
            <Link to={`/store/${slug}/shop`}>
              <ShoppingBag className="mr-2 h-4 w-4" /> Shop now
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-widest text-primary">Online store</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">{s.name}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          {s.storeHeadline ?? "Browse our catalog and order online. Prices in " + s.baseCurrencyCode + "."}
        </p>
        <Button size="lg" className="mt-8" asChild>
          <Link to={`/store/${slug}/shop`}>
            Browse products <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </main>
    </div>
  );
}
