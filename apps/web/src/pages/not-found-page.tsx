import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold">We can’t find that page</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you tried to open does not exist or you don’t have access.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link to="/">Home</Link>
          </Button>
          <Button variant="subtle" asChild>
            <Link to="/app/dashboard">My workspace</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
