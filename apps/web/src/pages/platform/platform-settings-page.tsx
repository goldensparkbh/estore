import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApiFetch } from "@/lib/admin-api";
import { PageHeader } from "@/components/platform/page-header";
import { inputClass, labelClass } from "@/lib/platform-types";
import { Button } from "@/components/ui/button";

export function PlatformSettingsPage(): ReactElement {
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["admin-email-status"],
    queryFn: () =>
      adminApiFetch<{ data: { configured: boolean; from: string | null; provider: string | null } }>(
        "/v1/admin/settings/email",
      ),
  });

  const sendTest = useMutation({
    mutationFn: () =>
      adminApiFetch<{ data: { sent: boolean; messageId?: string } }>("/v1/admin/settings/email/test", {
        method: "POST",
        body: JSON.stringify({ to: testEmail }),
      }),
    onSuccess: () => setMessage("Test email sent successfully."),
    onError: (e) => setMessage(e instanceof Error ? e.message : "Send failed"),
  });

  const cfg = status.data?.data;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Email delivery"
        description="Configure Resend for subscription reminders and operator notifications."
      />

      <article className="rounded-xl border border-border bg-card p-6 text-sm">
        <p>
          <span className="text-muted-foreground">Status:</span>{" "}
          {cfg?.configured ? (
            <span className="text-emerald-400">Connected ({cfg.provider})</span>
          ) : (
            <span className="text-amber-400">Not configured</span>
          )}
        </p>
        <p className="mt-2 text-muted-foreground">
          Set <code className="rounded bg-muted px-1">RESEND_API_KEY</code> and optionally{" "}
          <code className="rounded bg-muted px-1">PLATFORM_EMAIL_FROM</code> on the API service, then
          redeploy.
        </p>
        {cfg?.from && (
          <p className="mt-2">
            <span className="text-muted-foreground">From:</span> {cfg.from}
          </p>
        )}
      </article>

      <form
        className="rounded-xl border border-border bg-card p-6 space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setMessage(null);
          void sendTest.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Send test email</h2>
        <label className="block text-sm">
          <span className={labelClass}>Recipient</span>
          <input
            type="email"
            required
            className={inputClass}
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={sendTest.isPending || !cfg?.configured}>
          {sendTest.isPending ? "Sending…" : "Send test"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </form>
    </section>
  );
}
