import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireCtx } from "../middleware/tenant.js";

export const referenceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/currencies", async (request) => {
    requireCtx(request);
    const rows = await prisma.currency.findMany({ orderBy: { code: "asc" } });
    const data = rows.map((c) => ({
      code: c.code,
      symbol: c.symbol,
      exchangeRate: c.exchangeRate.toString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    return { data };
  });

  app.get("/tenant", async (request) => {
    const { tenantId } = requireCtx(request);
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, timezone: true, baseCurrencyCode: true },
    });
    return { data: tenant };
  });
};
