import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreNavbar } from "@/components/store/store-navbar";
import { StoreThemeEffect } from "@/components/theme-sync";
import { publicFetch, type Storefront } from "@/lib/store-public";

interface LegalResponse {
  data: {
    slug: string;
    storeName: string;
    storeLogoUrl: string | null;
    policy: string;
    title: string;
    content: string;
  };
}

export function StoreLegalPage(): ReactElement {
  const { slug = "", policy = "terms" } = useParams();

  const store = useQuery({
    queryKey: ["store", slug],
    queryFn: () => publicFetch<{ data: Storefront }>(`/v1/store/${slug}`),
    enabled: Boolean(slug),
  });

  const legal = useQuery({
    queryKey: ["store-legal", slug, policy],
    queryFn: () => publicFetch<LegalResponse>(`/v1/store/${slug}/legal/${policy}`),
    enabled: Boolean(slug) && ["terms", "privacy", "refund"].includes(policy),
  });

  if (store.isLoading || legal.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (store.isError || legal.isError || !store.data || !legal.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="font-semibold">Page not found</p>
        <Button variant="subtle" asChild>
          <Link to={`/store/${slug}`}>Back to store</Link>
        </Button>
      </div>
    );
  }

  const s = store.data.data;
  const doc = legal.data.data;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StoreThemeEffect uiTheme={s.uiTheme} />
      <StoreNavbar store={s} slug={slug} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Button variant="ghost" size="sm" className="mb-6" asChild>
          <Link to={`/store/${slug}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to store
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{doc.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{doc.storeName}</p>
        <article className="prose prose-sm mt-8 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {doc.content}
        </article>
      </main>
      <StoreFooter store={s} slug={slug} />
    </div>
  );
}
