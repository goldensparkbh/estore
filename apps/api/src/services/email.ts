export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider?: string;
  messageId?: string;
  error?: string;
}

function fromAddress(): string {
  return process.env.PLATFORM_EMAIL_FROM ?? "ERP Platform <onboarding@resend.dev>";
}

export async function sendPlatformEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<p>${escapeHtml(input.text).replace(/\n/g, "<br/>")}</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { sent: false, provider: "resend", error: body || `HTTP ${res.status}` };
  }

  const json = (await res.json()) as { id?: string };
  return { sent: true, provider: "resend", messageId: json.id };
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
