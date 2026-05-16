import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { publicApiFetch } from "@/lib/public-api";
import { useSessionStore } from "@/stores/session-store";
import { Button } from "@/components/ui/button";

interface SignupResponse {
  data: {
    tenantId: string;
    userId: string;
    tenantSlug: string;
    email: string;
    displayName: string;
    role: string;
  };
}

export function SignupPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const planSlug = searchParams.get("plan") ?? "free";
  const navigate = useNavigate();
  const setSession = useSessionStore((s) => s.setSession);
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await publicApiFetch<SignupResponse>("/v1/public/signup", {
        method: "POST",
        body: JSON.stringify({
          organizationName: org,
          email,
          password,
          planSlug,
        }),
      });
      setSession({
        tenantId: res.data.tenantId,
        userId: res.data.userId,
        tenantSlug: res.data.tenantSlug,
        email: res.data.email,
      });
      navigate("/app/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
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
          <h1 className="text-xl font-semibold">Create workspace</h1>
          <p className="text-sm text-muted-foreground">
            Selected plan: <span className="font-mono text-foreground">{planSlug}</span>. You can
            change billing later if you are an owner.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="org">
              Organization name
            </label>
            <input
              id="org"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
              Work email
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
              Password (min 10 characters)
            </label>
            <input
              id="pw"
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            Create account
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Already have access?{" "}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
