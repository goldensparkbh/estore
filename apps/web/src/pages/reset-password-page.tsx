import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { publicApiFetch } from "@/lib/public-api";
import { Button } from "@/components/ui/button";

export function ResetPasswordPage(): ReactElement {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const token = search.get("token") ?? "";
  const tenantSlug = search.get("slug") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await publicApiFetch("/v1/public/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, tenantSlug, newPassword: pw }),
      });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <Link to="/login" className="text-sm font-semibold">
          ← Back to sign in
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
        >
          <h1 className="text-xl font-semibold">Set a new password</h1>
          {(!token || !tenantSlug) && (
            <p className="text-sm text-red-400">
              Reset link is missing required parameters. Use the link from your email.
            </p>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="np">
              New password (min 10)
            </label>
            <input
              id="np"
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={10}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="np2">
              Confirm
            </label>
            <input
              id="np2"
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={10}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {done && (
            <p className="text-sm text-emerald-400">
              Password updated. Redirecting to sign in…
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !token || !tenantSlug}
          >
            Set password
          </Button>
        </form>
      </div>
    </div>
  );
}
