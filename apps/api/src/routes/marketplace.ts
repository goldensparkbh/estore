import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { MarketplacePaymentStatus } from "@prisma/client";
import { requireCtx } from "../middleware/tenant.js";
import { requireRole } from "../middleware/rbac.js";
import {
  getMarketplaceOrder,
  listMarketplaceOrders,
  syncMarketplaceOrderFromTap,
} from "../services/marketplace.js";

export const marketplaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/orders", async (request) => {
    await requireRole(request, ["OWNER", "ADMIN"]);
    const ctx = requireCtx(request);
    const q = z
      .object({
        status: z
          .enum([
            "PENDING",
            "INITIATED",
            "AUTHORIZED",
            "CAPTURED",
            "FAILED",
            "CANCELLED",
            "REFUNDED",
            "PARTIALLY_REFUNDED",
          ])
          .optional(),
      })
      .parse(request.query);

    const data = await listMarketplaceOrders({
      tenantId: ctx.tenantId,
      status: q.status as MarketplacePaymentStatus | undefined,
    });
    return { data };
  });

  app.get("/orders/:id", async (request) => {
    await requireRole(request, ["OWNER", "ADMIN"]);
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getMarketplaceOrder(p.id, ctx.tenantId) };
  });

  app.post("/orders/:id/sync", async (request) => {
    await requireRole(request, ["OWNER", "ADMIN"]);
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    await getMarketplaceOrder(p.id, ctx.tenantId);
    return { data: await syncMarketplaceOrderFromTap(p.id) };
  });
};
