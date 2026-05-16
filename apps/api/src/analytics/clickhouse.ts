import { createClient } from "@clickhouse/client";

export interface SalesAnalyticsRow {
  tenantId: string;
  day: string;
  totalAmount: string;
}

/**
 * Server-side analytics sink. Prisma remains the source of truth; this client is for heavy aggregates.
 * Ensure `events_sales_daily` exists in ClickHouse (migration SQL in `sql/clickhouse/`).
 */
export function getClickHouse() {
  const url = process.env.CLICKHOUSE_URL;
  const database = process.env.CLICKHOUSE_DATABASE ?? "erp_analytics";
  if (!url) return null;
  return createClient({ url, database });
}

export async function recordSaleAnalytics(row: SalesAnalyticsRow): Promise<void> {
  const ch = getClickHouse();
  if (!ch) return;
  try {
    await ch.insert({
      table: "events_sales_daily",
      values: [
        {
          tenant_id: row.tenantId,
          day: row.day,
          total_amount: row.totalAmount,
          event_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        },
      ],
      format: "JSONEachRow",
    });
  } catch {
    // Non-fatal: operational reporting still works via Postgres
  }
}
