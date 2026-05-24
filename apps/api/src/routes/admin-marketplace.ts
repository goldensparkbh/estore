import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { MarketplacePaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  getMarketplaceOrder,
  getPlatformSettings,
  listMarketplaceOrders,
  syncMarketplaceOrderFromTap,
} from "../services/marketplace.js";

export const adminMarketplaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/marketplace/settings", async () => {
    const settings = await getPlatformSettings();
    return {
      data: {
        platformName: settings.platformName,
        defaultCommissionRate: settings.defaultCommissionRate.toString(),
        estimatedTapFeeRate: settings.estimatedTapFeeRate.toString(),
        updatedAt: settings.updatedAt.toISOString(),
      },
    };
  });

  app.patch("/marketplace/settings", async (request) => {
    const body = z
      .object({
        platformName: z.string().min(1).max(120).optional(),
        defaultCommissionRate: z.string().optional(),
        estimatedTapFeeRate: z.string().optional(),
      })
      .parse(request.body);

    const updated = await prisma.platformMarketplaceSettings.update({
      where: { id: "golden-spark" },
      data: {
        platformName: body.platformName,
        defaultCommissionRate: body.defaultCommissionRate,
        estimatedTapFeeRate: body.estimatedTapFeeRate,
      },
    });

    return {
      data: {
        platformName: updated.platformName,
        defaultCommissionRate: updated.defaultCommissionRate.toString(),
        estimatedTapFeeRate: updated.estimatedTapFeeRate.toString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  });

  app.get("/marketplace/orders", async (request) => {
    const q = z
      .object({
        tenantId: z.string().uuid().optional(),
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
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(request.query);

    const data = await listMarketplaceOrders({
      tenantId: q.tenantId,
      status: q.status as MarketplacePaymentStatus | undefined,
      limit: q.limit,
    });
    return { data };
  });

  app.get("/marketplace/orders/:id", async (request) => {
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getMarketplaceOrder(p.id) };
  });

  app.post("/marketplace/orders/:id/sync", async (request) => {
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await syncMarketplaceOrderFromTap(p.id) };
  });
};
