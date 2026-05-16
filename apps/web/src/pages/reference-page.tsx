import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface Currency {
  code: string;
  symbol: string;
  exchangeRate: string;
  updatedAt: string;
}

interface CurResponse {
  data: Currency[];
}

export function ReferencePage(): ReactElement {
  const q = useQuery({
    queryKey: ["currencies"],
    queryFn: () => apiFetch<CurResponse>("/v1/reference/currencies"),
  });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Currencies</p>
        <p className="text-xs text-muted-foreground">Multi-currency rates relative to reporting base.</p>
      </div>
      <div className="divide-y divide-border">
        {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {q.isError && <p className="p-4 text-sm text-red-400">{(q.error as Error).message}</p>}
        {(q.data?.data ?? []).map((c) => (
          <div key={c.code} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-mono">{c.code}</span>
            <span className="text-muted-foreground">
              {c.symbol} · {c.exchangeRate}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
