import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { publicApiFetch } from "@/lib/public-api";
import { useSessionStore } from "@/stores/session-store";
import { Button } from "@/components/ui/button";

interface LoginResponse {
  data: {
    tenantId: string;
    userId: string;
    tenantSlug: string;
    email: string;
    displayName: string;
    role: string;
  };
}

export function LoginPage(): ReactElement {
  const navigate = useNavigate();
  const setSession = useSessionStore((s) => s.setSession);
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await publicApiFetch<LoginResponse>("/v1/public/login", {
        method: "POST",
        body: JSON.stringify({ tenantSlug, email, password }),
      });
      setSession({
        tenantId: res.data.tenantId,
        userId: res.data.userId,
        tenantSlug: res.data.tenantSlug,
        email: res.data.email,
      });
      navigate("/app/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <Link to="/" className="text-sm font-semibold">
          ← Back
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
        >
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Use your organization slug (subdomain), email, and password.
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
              placeholder="e.g. demo"
              autoComplete="organization"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pw">
              Password
            </label>
            <input
              id="pw"
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            Continue
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No workspace?{" "}
            <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
