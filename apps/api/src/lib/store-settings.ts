import { z } from "zod";
import type { Prisma } from "@prisma/client";

export function parseUiTheme(value: string | null | undefined): "light" | "dark" {
  return value === "dark" ? "dark" : "light";
}

export const storeSocialLinksSchema = z
  .object({
    facebook: z.string().max(500).nullable().optional(),
    instagram: z.string().max(500).nullable().optional(),
    twitter: z.string().max(500).nullable().optional(),
    tiktok: z.string().max(500).nullable().optional(),
    linkedin: z.string().max(500).nullable().optional(),
    youtube: z.string().max(500).nullable().optional(),
    whatsapp: z.string().max(500).nullable().optional(),
  })
  .nullable()
  .optional();

export const storeCarouselSchema = z.array(z.string().max(2048)).max(12).nullable().optional();

export const storeUrlOrPath = z.string().max(2048).nullable().optional();

export const tenantStorePatchSchema = z.object({
  storeEnabled: z.boolean().optional(),
  storeHeadline: z.string().max(240).nullable().optional(),
  storeLogoUrl: storeUrlOrPath,
  storeContactEmail: z.string().email().nullable().optional(),
  storePhone: z.string().max(40).nullable().optional(),
  storeCarouselImages: storeCarouselSchema,
  storeSocialLinks: storeSocialLinksSchema,
  storeTermsText: z.string().max(50000).nullable().optional(),
  storePrivacyText: z.string().max(50000).nullable().optional(),
  storeRefundPolicyText: z.string().max(50000).nullable().optional(),
  uiTheme: z.enum(["light", "dark"]).optional(),
  tapDestinationId: z.string().max(120).nullable().optional(),
  marketplaceCommissionRate: z.string().nullable().optional(),
});

export type StoreSocialLinks = z.infer<typeof storeSocialLinksSchema>;

export function parseStoreSocialLinks(raw: Prisma.JsonValue | null | undefined): StoreSocialLinks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = storeSocialLinksSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseStoreCarousel(raw: Prisma.JsonValue | null | undefined): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 12);
}

export function serializeStorefront(tenant: {
  id: string;
  name: string;
  slug: string;
  storeHeadline: string | null;
  storeLogoUrl: string | null;
  storeContactEmail: string | null;
  storePhone: string | null;
  storeCarouselImages: Prisma.JsonValue | null;
  storeSocialLinks: Prisma.JsonValue | null;
  storeTermsText: string | null;
  storePrivacyText: string | null;
  storeRefundPolicyText: string | null;
  uiTheme: string;
  baseCurrencyCode: string;
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    storeHeadline: tenant.storeHeadline,
    storeLogoUrl: tenant.storeLogoUrl,
    storeContactEmail: tenant.storeContactEmail,
    storePhone: tenant.storePhone,
    storeCarouselImages: parseStoreCarousel(tenant.storeCarouselImages),
    storeSocialLinks: parseStoreSocialLinks(tenant.storeSocialLinks),
    storeTermsText: tenant.storeTermsText,
    storePrivacyText: tenant.storePrivacyText,
    storeRefundPolicyText: tenant.storeRefundPolicyText,
    uiTheme: parseUiTheme(tenant.uiTheme),
    baseCurrencyCode: tenant.baseCurrencyCode,
    hasTerms: Boolean(tenant.storeTermsText?.trim()),
    hasPrivacy: Boolean(tenant.storePrivacyText?.trim()),
    hasRefundPolicy: Boolean(tenant.storeRefundPolicyText?.trim()),
  };
}

export const storefrontSelect = {
  id: true,
  name: true,
  slug: true,
  storeHeadline: true,
  storeLogoUrl: true,
  storeContactEmail: true,
  storePhone: true,
  storeCarouselImages: true,
  storeSocialLinks: true,
  storeTermsText: true,
  storePrivacyText: true,
  storeRefundPolicyText: true,
  uiTheme: true,
  baseCurrencyCode: true,
} as const;
