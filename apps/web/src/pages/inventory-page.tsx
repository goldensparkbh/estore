import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { StockBatchTable, type StockBatchVm } from "@/features/inventory/stock-batch-table";

interface ListResponse {
  data: StockBatchVm[];
}

export function InventoryPage(): ReactElement {
  const q = useQuery({
    queryKey: ["inventory", "stock-batches"],
    queryFn: async () => apiFetch<ListResponse>("/v1/inventory/stock-batches"),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading stock…</p>;
  }
  if (q.isError) {
    return (
      <p className="text-sm text-red-400">
        {(q.error as Error).message ?? "Failed to load inventory."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <StockBatchTable rows={q.data?.data ?? []} />
    </div>
  );
}
