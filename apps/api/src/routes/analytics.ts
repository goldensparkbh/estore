import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireCtx } from "../middleware/tenant.js";
import { queryDailySales } from "../analytics/clickhouse.js";

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/sales", async (request) => {
    const ctx = requireCtx(request);
    const q = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(
      request.query,
    );

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - q.days);

    const [chDaily, topSkus, summary] = await Promise.all([
      queryDailySales(ctx.tenantId, q.days),
      prisma.saleLine.groupBy({
        by: ["productId"],
        where: { sale: { tenantId: ctx.tenantId, status: "COMPLETED", createdAt: { gte: since } } },
        _sum: { lineTotal: true, quantity: true },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: 10,
      }),
      prisma.sale.aggregate({
        where: {
          tenantId: ctx.tenantId,
          status: "COMPLETED",
          createdAt: { gte: since },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    const productIds = topSkus.map((t) => t.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name: true, imageUrl: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let daily = chDaily;
    if (daily.length === 0) {
      const pgDaily = await prisma.$queryRaw<
        Array<{ day: Date; total: string; count: bigint }>
      >`
        SELECT date_trunc('day', "createdAt") AS day,
               SUM("totalAmount")::text AS total,
               COUNT(*)::bigint AS count
        FROM "Sale"
        WHERE "tenantId" = ${ctx.tenantId}
          AND status = 'COMPLETED'
          AND "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
      daily = pgDaily.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        total: r.total,
        count: Number(r.count),
      }));
    }

    return {
      data: {
        periodDays: q.days,
        summary: {
          totalSales: summary._count._all,
          totalRevenue: summary._sum.totalAmount?.toString() ?? "0",
        },
        daily,
        topSkus: topSkus.map((t) => {
          const p = productMap.get(t.productId);
          return {
            productId: t.productId,
            sku: p?.sku ?? "—",
            name: p?.name ?? "Unknown",
            imageUrl: p?.imageUrl ?? null,
            quantity: t._sum.quantity?.toString() ?? "0",
            revenue: t._sum.lineTotal?.toString() ?? "0",
          };
        }),
        source: chDaily.length > 0 ? "clickhouse" : "postgres",
      },
    };
  });

  app.get("/inventory", async (request) => {
    const ctx = requireCtx(request);
    const [warehouses, products, lowStockRules] = await Promise.all([
      prisma.warehouse.count({ where: { tenantId: ctx.tenantId } }),
      prisma.product.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
      prisma.reorderRule.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
    ]);

    const stockValue = await prisma.stockBatch.aggregate({
      where: { tenantId: ctx.tenantId },
      _sum: { quantityOnHand: true },
    });

    return {
      data: {
        warehouses,
        activeProducts: products,
        reorderRules: lowStockRules,
        totalUnitsOnHand: stockValue._sum.quantityOnHand?.toString() ?? "0",
      },
    };
  });
};
