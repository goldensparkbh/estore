import type { KeyboardEvent, ReactElement } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface StockBatchVm {
  id: string;
  quantityOnHand: string;
  lotNumber: string | null;
  currencyCode: string;
  unitCostAmount: string;
  product: { id: string; sku: string; name: string; barcode: string | null };
  warehouse: { id: string; name: string; code: string };
}

interface StockBatchTableProps {
  rows: StockBatchVm[];
  onQtyCommit?: (id: string, nextQty: string) => void;
}

export function StockBatchTable({ rows, onQtyCommit }: StockBatchTableProps): ReactElement {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const columns = useMemo<ColumnDef<StockBatchVm>[]>(
    () => [
      {
        accessorKey: "product.sku",
        header: "SKU",
        cell: (info) => <span className="font-mono text-xs">{info.getValue<string>()}</span>,
      },
      {
        accessorKey: "product.name",
        header: "Product",
        cell: (info) => <span className="truncate">{info.getValue<string>()}</span>,
      },
      {
        accessorKey: "warehouse.code",
        header: "WH",
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">{info.getValue<string>()}</span>
        ),
      },
      {
        id: "qty",
        header: "On hand",
        cell: ({ row }) => {
          const id = row.original.id;
          const val = drafts[id] ?? row.original.quantityOnHand;
          return (
            <input
              className="h-8 w-24 rounded-md border border-border bg-transparent px-2 text-xs font-mono outline-none ring-primary/40 focus:ring-2"
              value={val}
              data-row-index={row.index}
              data-col="qty"
              onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
              onBlur={() => {
                if (onQtyCommit && drafts[id] !== undefined) {
                  onQtyCommit(id, drafts[id]);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const next = e.shiftKey ? row.index - 1 : row.index + 1;
                  const el = document.querySelector<HTMLInputElement>(
                    `input[data-row-index="${next}"][data-col="qty"]`,
                  );
                  el?.focus();
                }
              }}
            />
          );
        },
      },
      {
        accessorKey: "unitCostAmount",
        header: "Unit cost",
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">{info.getValue<string>()}</span>
        ),
      },
    ],
    [drafts, onQtyCommit],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();

  const padTop = items.length > 0 ? items[0].start : 0;
  const padBottom =
    items.length > 0
      ? virtualizer.getTotalSize() - (items[items.length - 1].end ?? 0)
      : 0;

  const handleGridNav = useCallback((e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    e.preventDefault();
    const rowIndex = Number(target.getAttribute("data-row-index"));
    const next = e.key === "ArrowDown" ? rowIndex + 1 : rowIndex - 1;
    const el = document.querySelector<HTMLInputElement>(
      `input[data-row-index="${next}"][data-col="qty"]`,
    );
    el?.focus();
  }, []);

  return (
    <div
      className="rounded-xl border border-border bg-card"
      onKeyDownCapture={handleGridNav}
      role="presentation"
    >
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Stock batches</p>
        <p className="text-xs text-muted-foreground">
          Virtualized grid with inline keyboard navigation (Tab / arrows on quantity).
        </p>
      </div>
      <div ref={parentRef} className="h-[560px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr>
                <td colSpan={columns.length} style={{ height: padTop }} />
              </tr>
            )}
            {items.map((v) => {
              const row = table.getRowModel().rows[v.index];
              if (!row) return null;
              return (
                <tr key={row.id} className="border-b border-border/80 hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-1.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 && (
              <tr>
                <td colSpan={columns.length} style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
