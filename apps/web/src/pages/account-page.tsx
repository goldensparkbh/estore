import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";

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
    };
  };
}

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function AccountPage(): ReactElement {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clearSession = useSessionStore((s) => s.clearSession);
  const setSession = useSessionStore((s) => s.setSession);

  const [storeEnabled, setStoreEnabled] = useState(false);
  const [storeHeadline, setStoreHeadline] = useState("");
  const [storeLogoUrl, setStoreLogoUrl] = useState("");

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
    mutationFn: (vars: {
      name?: string;
      timezone?: string;
      baseCurrencyCode?: string;
      billingEmail?: string | null;
      storeEnabled?: boolean;
      storeHeadline?: string | null;
      storeLogoUrl?: string | null;
    }) =>
      apiFetch<{ data: unknown }>("/v1/account/tenant", {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["account-me"] }),
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
    tenantMut.mutate({
      name: orgName,
      timezone,
      baseCurrencyCode: currency,
      billingEmail: billingEmail.trim() ? billingEmail.trim() : null,
      storeEnabled,
      storeHeadline: storeHeadline.trim() || null,
      storeLogoUrl: storeLogoUrl.trim() || null,
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
    <div className="mx-auto max-w-3xl space-y-8">
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
          <div className="space-y-1">
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
            <label className={labelClass} htmlFor="sl">Logo URL (optional)</label>
            <input
              id="sl"
              className={inputClass}
              value={storeLogoUrl}
              onChange={(e) => setStoreLogoUrl(e.target.value)}
              disabled={!isAdminish}
              placeholder="https://…"
            />
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
