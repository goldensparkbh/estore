import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { publicApiFetch } from "@/lib/public-api";
import { Button } from "@/components/ui/button";

export function ForgotPasswordPage(): ReactElement {
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await publicApiFetch("/v1/public/forgot-password", {
        method: "POST",
        body: JSON.stringify({ tenantSlug, email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
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
          <h1 className="text-xl font-semibold">Reset password</h1>
          <p className="text-sm text-muted-foreground">
            We will email you a link if the account exists.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="slug">
              Organization slug
            </label>
            <input
              id="slug"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="em">
              Email
            </label>
            <input
              id="em"
              type="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {sent && (
            <p className="text-sm text-emerald-400">
              If the account exists, a reset link has been sent.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            Send reset link
          </Button>
        </form>
      </div>
    </div>
  );
}
