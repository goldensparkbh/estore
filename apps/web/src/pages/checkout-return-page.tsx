import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function CheckoutReturnPage(): ReactElement {
  const [search] = useSearchParams();
  const sessionId = search.get("session_id");
  const [state, setState] = useState<"loading" | "paid" | "pending" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (!sessionId) {
        setState("error");
        setError("Missing checkout session id.");
        return;
      }
      try {
        const res = await apiFetch<{
          data: { status: string | null; paymentStatus: string | null };
        }>(`/v1/billing/checkout-session/${encodeURIComponent(sessionId)}`);
        if (cancelled) return;
        if (res.data.paymentStatus === "paid" || res.data.status === "complete") {
          setState("paid");
          return;
        }
        setState("pending");
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        {state === "loading" && (
          <p className="text-sm text-muted-foreground">Confirming your payment…</p>
        )}
        {state === "pending" && (
          <>
            <p className="text-sm font-semibold">Payment processing</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Stripe is still finalising. This page will update automatically.
            </p>
          </>
        )}
        {state === "paid" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <h1 className="mt-4 text-lg font-semibold">Payment received</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your subscription is active. You can change or cancel anytime in Billing.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild>
                <Link to="/app/dashboard">Open dashboard</Link>
              </Button>
              <Button variant="subtle" asChild>
                <Link to="/app/billing">Billing</Link>
              </Button>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-400" />
            <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-6">
              <Button asChild>
                <Link to="/app/billing">Back to billing</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
