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

export interface DailySalesRow {
  day: string;
  total: string;
  count: number;
}

export async function queryDailySales(
  tenantId: string,
  days: number,
): Promise<DailySalesRow[]> {
  const ch = getClickHouse();
  if (!ch) return [];

  try {
    const result = await ch.query({
      query: `
        SELECT
          toString(day) AS day,
          sum(total_amount) AS total,
          count() AS cnt
        FROM events_sales_daily
        WHERE tenant_id = {tenantId:UUID}
          AND day >= today() - {days:UInt32}
        GROUP BY day
        ORDER BY day ASC
      `,
      query_params: { tenantId, days },
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as Array<{ day: string; total: string; cnt: string }>;
    return rows.map((r) => ({
      day: r.day,
      total: String(r.total),
      count: Number(r.cnt),
    }));
  } catch {
    return [];
  }
}
