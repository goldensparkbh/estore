import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

import type { StoreSocialLinks } from "@/lib/store-public";
import type { UiTheme } from "@/lib/theme";

interface MeResponse {
  data: {
    user: { id: string; email: string; displayName: string; role: string };
    tenant: {
      id: string;
      name: string;
      slug: string;
      timezone: string;
      baseCurrencyCode: string;
      billingEmail: string | null;
      storeEnabled: boolean;
      storeHeadline: string | null;
      storeLogoUrl: string | null;
      storeContactEmail: string | null;
      storePhone: string | null;
      storeCarouselImages: string[] | null;
      storeSocialLinks: StoreSocialLinks | null;
      storeTermsText: string | null;
      storePrivacyText: string | null;
      storeRefundPolicyText: string | null;
      uiTheme: UiTheme;
      tapDestinationId: string | null;
      marketplaceCommissionRate: string | null;
    };
  };
}

function carouselToText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw.filter((v): v is string => typeof v === "string").join("\n");
}

function socialFromTenant(raw: StoreSocialLinks | null | undefined): StoreSocialLinks {
  return raw ?? {};
}

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function AccountPage(): ReactElement {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clearSession = useSessionStore((s) => s.clearSession);
  const setSession = useSessionStore((s) => s.setSession);
  const applyTheme = useUiStore((s) => s.setTheme);

  const [storeEnabled, setStoreEnabled] = useState(false);
  const [storeHeadline, setStoreHeadline] = useState("");
  const [storeLogoUrl, setStoreLogoUrl] = useState("");
  const [storeContactEmail, setStoreContactEmail] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeCarouselText, setStoreCarouselText] = useState("");
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialTiktok, setSocialTiktok] = useState("");
  const [socialLinkedin, setSocialLinkedin] = useState("");
  const [socialYoutube, setSocialYoutube] = useState("");
  const [socialWhatsapp, setSocialWhatsapp] = useState("");
  const [storeTermsText, setStoreTermsText] = useState("");
  const [storePrivacyText, setStorePrivacyText] = useState("");
  const [storeRefundPolicyText, setStoreRefundPolicyText] = useState("");
  const [uiTheme, setUiTheme] = useState<UiTheme>("light");
  const [tapDestinationId, setTapDestinationId] = useState("");
  const [marketplaceCommissionRate, setMarketplaceCommissionRate] = useState("");

  const me = useQuery({
    queryKey: ["account-me"],
    queryFn: () => apiFetch<MeResponse>("/v1/account/me"),
  });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (me.data?.data?.user) {
      setDisplayName(me.data.data.user.displayName);
      setEmail(me.data.data.user.email);
    }
  }, [me.data?.data?.user]);

  const [orgName, setOrgName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  useEffect(() => {
    if (me.data?.data?.tenant) {
      setOrgName(me.data.data.tenant.name);
      setTimezone(me.data.data.tenant.timezone);
      setCurrency(me.data.data.tenant.baseCurrencyCode);
      setBillingEmail(me.data.data.tenant.billingEmail ?? "");
      setStoreEnabled(me.data.data.tenant.storeEnabled ?? false);
      setStoreHeadline(me.data.data.tenant.storeHeadline ?? "");
      setStoreLogoUrl(me.data.data.tenant.storeLogoUrl ?? "");
      setStoreContactEmail(me.data.data.tenant.storeContactEmail ?? "");
      setStorePhone(me.data.data.tenant.storePhone ?? "");
      setStoreCarouselText(carouselToText(me.data.data.tenant.storeCarouselImages));
      const social = socialFromTenant(me.data.data.tenant.storeSocialLinks);
      setSocialFacebook(social.facebook ?? "");
      setSocialInstagram(social.instagram ?? "");
      setSocialTwitter(social.twitter ?? "");
      setSocialTiktok(social.tiktok ?? "");
      setSocialLinkedin(social.linkedin ?? "");
      setSocialYoutube(social.youtube ?? "");
      setSocialWhatsapp(social.whatsapp ?? "");
      setStoreTermsText(me.data.data.tenant.storeTermsText ?? "");
      setStorePrivacyText(me.data.data.tenant.storePrivacyText ?? "");
      setStoreRefundPolicyText(me.data.data.tenant.storeRefundPolicyText ?? "");
      setUiTheme(me.data.data.tenant.uiTheme === "dark" ? "dark" : "light");
      setTapDestinationId(me.data.data.tenant.tapDestinationId ?? "");
      setMarketplaceCommissionRate(
        me.data.data.tenant.marketplaceCommissionRate != null
          ? String(me.data.data.tenant.marketplaceCommissionRate)
          : "",
      );
    }
  }, [me.data?.data?.tenant]);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const profileMut = useMutation({
    mutationFn: (vars: { displayName?: string; email?: string }) =>
      apiFetch<{ data: { id: string; email: string; displayName: string } }>(
        "/v1/account/me",
        { method: "PATCH", body: JSON.stringify(vars) },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["account-me"] });
      const current = useSessionStore.getState();
      setSession({ ...current, email: res.data.email });
    },
  });

  const tenantMut = useMutation({
    mutationFn: (vars: Record<string, unknown>) =>
      apiFetch<{ data: unknown }>("/v1/account/tenant", {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      applyTheme(uiTheme);
      void qc.invalidateQueries({ queryKey: ["account-me"] });
    },
  });

  const passwordMut = useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ data: { changed: boolean } }>(
        "/v1/account/me/change-password",
        { method: "POST", body: JSON.stringify(vars) },
      ),
    onSuccess: () => {
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
  });

  const onProfile = (e: FormEvent): void => {
    e.preventDefault();
    profileMut.mutate({ displayName, email });
  };

  const onTenant = (e: FormEvent): void => {
    e.preventDefault();
    const carouselUrls = storeCarouselText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const socialLinks: StoreSocialLinks = {
      facebook: socialFacebook.trim() || null,
      instagram: socialInstagram.trim() || null,
      twitter: socialTwitter.trim() || null,
      tiktok: socialTiktok.trim() || null,
      linkedin: socialLinkedin.trim() || null,
      youtube: socialYoutube.trim() || null,
      whatsapp: socialWhatsapp.trim() || null,
    };

    tenantMut.mutate({
      name: orgName,
      timezone,
      baseCurrencyCode: currency,
      billingEmail: billingEmail.trim() ? billingEmail.trim() : null,
      storeEnabled,
      storeHeadline: storeHeadline.trim() || null,
      storeLogoUrl: storeLogoUrl.trim() || null,
      storeContactEmail: storeContactEmail.trim() || null,
      storePhone: storePhone.trim() || null,
      storeCarouselImages: carouselUrls.length > 0 ? carouselUrls : null,
      storeSocialLinks: socialLinks,
      storeTermsText: storeTermsText.trim() || null,
      storePrivacyText: storePrivacyText.trim() || null,
      storeRefundPolicyText: storeRefundPolicyText.trim() || null,
      uiTheme,
      tapDestinationId: tapDestinationId.trim() || null,
      marketplaceCommissionRate: marketplaceCommissionRate.trim() || null,
    });
  };

  const onPassword = (e: FormEvent): void => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      passwordMut.reset();
      return;
    }
    passwordMut.mutate({ currentPassword: currentPw, newPassword: newPw });
  };

  const onSignOut = (): void => {
    clearSession();
    navigate("/login");
  };

  const role = me.data?.data?.user?.role ?? "";
  const isAdminish = role === "OWNER" || role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Account</p>
          <h1 className="text-xl font-semibold">Your profile & workspace</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-mono">{me.data?.data?.user?.email ?? "—"}</span> ·{" "}
            role <span className="font-mono">{role}</span>
          </p>
        </div>
        <Button variant="subtle" type="button" onClick={onSignOut}>
          Sign out
        </Button>
      </div>

      <form
        onSubmit={onProfile}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <h2 className="text-sm font-semibold">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="dn">Display name</label>
            <input
              id="dn"
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="em">Email</label>
            <input
              id="em"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        {profileMut.isError && (
          <p className="text-sm text-red-400">
            {(profileMut.error as Error).message}
          </p>
        )}
        {profileMut.isSuccess && (
          <p className="text-sm text-emerald-400">Profile updated.</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={profileMut.isPending}>
            Save profile
          </Button>
        </div>
      </form>

      <form
        onSubmit={onPassword}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <h2 className="text-sm font-semibold">Change password</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="cpw">Current password</label>
            <input
              id="cpw"
              type="password"
              className={inputClass}
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="npw">New password (min 10)</label>
            <input
              id="npw"
              type="password"
              className={inputClass}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={10}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="np2">Confirm new password</label>
            <input
              id="np2"
              type="password"
              className={inputClass}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              minLength={10}
              required
            />
          </div>
        </div>
        {newPw && confirmPw && newPw !== confirmPw && (
          <p className="text-sm text-red-400">Passwords do not match.</p>
        )}
        {passwordMut.isError && (
          <p className="text-sm text-red-400">
            {(passwordMut.error as Error).message}
          </p>
        )}
        {passwordMut.isSuccess && (
          <p className="text-sm text-emerald-400">Password updated.</p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={passwordMut.isPending || (Boolean(newPw) && newPw !== confirmPw)}
          >
            Update password
          </Button>
        </div>
      </form>

      <form
        onSubmit={onTenant}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Workspace</h2>
          <span className="text-xs text-muted-foreground">
            Slug: <span className="font-mono">{me.data?.data?.tenant?.slug ?? "—"}</span>
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="on">Organization name</label>
            <input
              id="on"
              className={inputClass}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={!isAdminish}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="tz">Timezone</label>
            <input
              id="tz"
              className={inputClass}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isAdminish}
              placeholder="UTC"
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="cur">Base currency</label>
            <input
              id="cur"
              className={inputClass}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              disabled={!isAdminish}
              placeholder="USD"
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="be">Billing email</label>
            <input
              id="be"
              type="email"
              className={inputClass}
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              disabled={!isAdminish}
              placeholder="finance@example.com"
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <h3 className="text-sm font-medium">Appearance</h3>
          <p className="text-xs text-muted-foreground">
            Applies to your workspace dashboard and public online store.
          </p>
          <div className="flex flex-wrap gap-3">
            {(["light", "dark"] as const).map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm capitalize transition ${
                  uiTheme === mode
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="uiTheme"
                  value={mode}
                  checked={uiTheme === mode}
                  disabled={!isAdminish}
                  className="sr-only"
                  onChange={() => {
                    setUiTheme(mode);
                    applyTheme(mode);
                  }}
                />
                {mode} theme
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
          <h3 className="text-sm font-medium">Online store</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={storeEnabled}
              onChange={(e) => setStoreEnabled(e.target.checked)}
              disabled={!isAdminish}
            />
            Enable public online store
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className={labelClass} htmlFor="sh">Store headline</label>
              <input
                id="sh"
                className={inputClass}
                value={storeHeadline}
                onChange={(e) => setStoreHeadline(e.target.value)}
                disabled={!isAdminish}
                placeholder="Quality goods delivered fast"
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="sl">Logo URL</label>
              <input
                id="sl"
                className={inputClass}
                value={storeLogoUrl}
                onChange={(e) => setStoreLogoUrl(e.target.value)}
                disabled={!isAdminish}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="sp">Phone (footer)</label>
              <input
                id="sp"
                className={inputClass}
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                disabled={!isAdminish}
                placeholder="+966 5x xxx xxxx"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={labelClass} htmlFor="sce">Store contact email</label>
              <input
                id="sce"
                type="email"
                className={inputClass}
                value={storeContactEmail}
                onChange={(e) => setStoreContactEmail(e.target.value)}
                disabled={!isAdminish}
                placeholder="hello@yourstore.com"
              />
              <p className="text-[10px] text-muted-foreground">
                Shown in the footer and receives contact form messages.
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={labelClass} htmlFor="scar">Carousel images (one URL per line)</label>
              <textarea
                id="scar"
                className={`${inputClass} min-h-[80px] font-mono text-xs`}
                value={storeCarouselText}
                onChange={(e) => setStoreCarouselText(e.target.value)}
                disabled={!isAdminish}
                placeholder={"https://example.com/banner-1.jpg\nhttps://example.com/banner-2.jpg"}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Social media links</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["Facebook", socialFacebook, setSocialFacebook],
                  ["Instagram", socialInstagram, setSocialInstagram],
                  ["Twitter / X", socialTwitter, setSocialTwitter],
                  ["TikTok", socialTiktok, setSocialTiktok],
                  ["LinkedIn", socialLinkedin, setSocialLinkedin],
                  ["YouTube", socialYoutube, setSocialYoutube],
                  ["WhatsApp", socialWhatsapp, setSocialWhatsapp],
                ] as const
              ).map(([label, val, set]) => (
                <div key={label} className="space-y-1">
                  <label className={labelClass}>{label}</label>
                  <input
                    className={inputClass}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    disabled={!isAdminish}
                    placeholder="https://…"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Footer policies</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className={labelClass} htmlFor="terms">Terms &amp; conditions</label>
                <textarea
                  id="terms"
                  className={`${inputClass} min-h-[80px] text-xs`}
                  value={storeTermsText}
                  onChange={(e) => setStoreTermsText(e.target.value)}
                  disabled={!isAdminish}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass} htmlFor="priv">Privacy policy</label>
                <textarea
                  id="priv"
                  className={`${inputClass} min-h-[80px] text-xs`}
                  value={storePrivacyText}
                  onChange={(e) => setStorePrivacyText(e.target.value)}
                  disabled={!isAdminish}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass} htmlFor="refund">Refund policy</label>
                <textarea
                  id="refund"
                  className={`${inputClass} min-h-[80px] text-xs`}
                  value={storeRefundPolicyText}
                  onChange={(e) => setStoreRefundPolicyText(e.target.value)}
                  disabled={!isAdminish}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Payments (TAP)</p>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="tap">TAP destination ID</label>
              <input
                id="tap"
                className={inputClass}
                value={tapDestinationId}
                onChange={(e) => setTapDestinationId(e.target.value)}
                disabled={!isAdminish}
                placeholder="dest_… from TAP marketplace onboarding"
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="mcr">Custom commission % (optional)</label>
              <input
                id="mcr"
                className={inputClass}
                value={marketplaceCommissionRate}
                onChange={(e) => setMarketplaceCommissionRate(e.target.value)}
                disabled={!isAdminish}
                placeholder="Leave blank for platform default"
              />
            </div>
          </div>

          {storeEnabled && me.data?.data?.tenant?.slug && (
            <p className="text-xs text-muted-foreground">
              Your store:{" "}
              <Link
                className="text-primary hover:underline"
                to={`/store/${me.data.data.tenant.slug}`}
                target="_blank"
              >
                /store/{me.data.data.tenant.slug}
              </Link>
              {" · "}
              Mark products with “Show in online store” in Inventory.
            </p>
          )}
        </div>
        {!isAdminish && (
          <p className="text-xs text-muted-foreground">
            Only owners and admins can edit workspace settings.
          </p>
        )}
        {tenantMut.isError && (
          <p className="text-sm text-red-400">{(tenantMut.error as Error).message}</p>
        )}
        {tenantMut.isSuccess && (
          <p className="text-sm text-emerald-400">Workspace updated.</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={tenantMut.isPending || !isAdminish}>
            Save workspace
          </Button>
        </div>
      </form>
    </div>
  );
}
