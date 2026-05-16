import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { publicApiFetch } from "@/lib/public-api";
import { usePlatformAdminStore } from "@/stores/platform-admin-store";
import { Button } from "@/components/ui/button";

interface Res {
  data: { adminId: string; email: string; displayName: string };
}

export function PlatformLoginPage(): ReactElement {
  const navigate = useNavigate();
  const setOperator = usePlatformAdminStore((s) => s.setOperator);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await publicApiFetch<Res>("/v1/public/platform/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setOperator({
        adminId: res.data.adminId,
        email: res.data.email,
        displayName: res.data.displayName,
      });
      navigate("/platform");
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
          ← Home
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8"
        >
          <h1 className="text-xl font-semibold">Platform operator</h1>
          <p className="text-sm text-muted-foreground">
            For your team managing customer subscriptions. Seed an admin with environment variables
            on deploy.
          </p>
          <input
            type="email"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
