import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useSessionStore } from "@/stores/session-store";
import { Button } from "@/components/ui/button";

export function SessionPage(): ReactElement {
  const { tenantId, userId, tenantSlug, email, setSession } = useSessionStore();
  const [t, setT] = useState(tenantId);
  const [u, setU] = useState(userId);
  const [slug, setSlug] = useState(tenantSlug);
  const [em, setEm] = useState(email);

  const onSave = (e: FormEvent): void => {
    e.preventDefault();
    setSession({
      tenantId: t.trim(),
      userId: u.trim(),
      tenantSlug: slug.trim(),
      email: em.trim(),
    });
  };

  return (
    <form
      onSubmit={onSave}
      className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <p className="text-sm font-semibold">Session identity</p>
        <p className="text-xs text-muted-foreground">
          Prefer signing in from the{" "}
          <Link to="/login" className="text-primary underline">
            login page
          </Link>
          . This form is for manual API troubleshooting.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="tenant">
          Tenant ID
        </label>
        <input
          id="tenant"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          value={t}
          onChange={(e) => setT(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="user">
          User ID
        </label>
        <input
          id="user"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          value={u}
          onChange={(e) => setU(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="slug">
          Organization slug (display)
        </label>
        <input
          id="slug"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
          Email (display)
        </label>
        <input
          id="email"
          type="email"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={em}
          onChange={(e) => setEm(e.target.value)}
        />
      </div>
      <Button type="submit">Save session</Button>
    </form>
  );
}
