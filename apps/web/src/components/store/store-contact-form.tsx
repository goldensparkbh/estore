import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { publicFetch } from "@/lib/store-public";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function StoreContactForm(props: { slug: string }): ReactElement {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: () =>
      publicFetch<{ data: { sent: boolean } }>(`/v1/store/${props.slug}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
        }),
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    send.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="sc-name">
            Name
          </label>
          <input
            id="sc-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="sc-email">
            Email
          </label>
          <input
            id="sc-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="sc-phone">
          Phone (optional)
        </label>
        <input
          id="sc-phone"
          className={inputClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="sc-msg">
          Message
        </label>
        <textarea
          id="sc-msg"
          className={`${inputClass} min-h-[120px]`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>
      {send.isError && (
        <p className="text-sm text-red-400">{(send.error as Error).message}</p>
      )}
      {send.isSuccess && (
        <p className="text-sm text-emerald-400">Message sent — we will get back to you soon.</p>
      )}
      <Button type="submit" disabled={send.isPending} className="w-full sm:w-auto">
        {send.isPending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
