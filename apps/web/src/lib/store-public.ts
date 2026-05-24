export interface StoreSocialLinks {
  facebook?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
  whatsapp?: string | null;
}

export interface Storefront {
  id: string;
  name: string;
  slug: string;
  storeHeadline: string | null;
  storeLogoUrl: string | null;
  storeContactEmail: string | null;
  storePhone: string | null;
  storeCarouselImages: string[];
  storeSocialLinks: StoreSocialLinks | null;
  storeTermsText: string | null;
  storePrivacyText: string | null;
  storeRefundPolicyText: string | null;
  uiTheme: "light" | "dark";
  baseCurrencyCode: string;
  hasTerms: boolean;
  hasPrivacy: boolean;
  hasRefundPolicy: boolean;
}

export interface StoreProduct {
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

export async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let msg = `HTTP ${res.status}`;
    if (ct.includes("application/problem+json")) {
      const p = (await res.json()) as { detail?: string; title?: string };
      msg = p.detail ?? p.title ?? msg;
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
