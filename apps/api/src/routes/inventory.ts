import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "../middleware/tenant.js";
import { adjustStock, receiveStock, transferStock } from "../services/inventory.js";
import { getCurrentSubscription, parsePlanFeatures } from "../services/billing.js";

const createWarehouse = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  isVirtual: z.boolean().optional(),
  addressLine: z.string().optional(),
});

const createProduct = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  defaultValuation: z.enum(["FIFO", "LIFO"]).optional(),
  barcode: z.string().optional(),
});

const receive = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.string(),
  unitCostAmount: z.string(),
  currencyCode: z.string().length(3),
  lotNumber: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const transfer = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  reference: z.string().optional(),
  lines: z
    .array(
      z.object({
        stockBatchId: z.string().uuid(),
        quantity: z.string(),
      }),
    )
    .min(1),
});

const adjustment = z.object({
  stockBatchId: z.string().uuid(),
  quantityDelta: z.string(),
  reason: z.string().min(1),
  type: z.enum(["ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE", "WASTAGE"]),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const iss of parsed.error.issues) {
      const k = iss.path.join(".") || "body";
      errors[k] ??= [];
      errors[k].push(iss.message);
    }
    throw new AppError(400, "Validation Error", "Request body failed validation.", undefined, errors);
  }
  return parsed.data;
}

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/warehouses", async (request) => {
    const { tenantId } = requireCtx(request);
    const rows = await prisma.warehouse.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return { data: rows };
  });

  app.post("/warehouses", async (request, reply) => {
    const body = parseBody(createWarehouse, request.body);
    const { tenantId } = requireCtx(request);
    const sub = await getCurrentSubscription(tenantId);
    if (sub) {
      const features = parsePlanFeatures(sub.plan.features);
      if (features.maxWarehouses != null) {
        const count = await prisma.warehouse.count({ where: { tenantId } });
        if (count >= features.maxWarehouses) {
          throw new AppError(
            403,
            "Plan limit",
            `Your plan allows at most ${features.maxWarehouses} warehouse(s). Upgrade to add more.`,
          );
        }
      }
    }
    const created = await prisma.warehouse.create({
      data: {
        tenantId,
        name: body.name,
        code: body.code,
        isVirtual: body.isVirtual ?? false,
        addressLine: body.addressLine,
      },
    });
    void reply.code(201);
    return { data: created };
  });

  app.get("/products", async (request) => {
    const { tenantId } = requireCtx(request);
    const rows = await prisma.product.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    const data = rows.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      barcode: p.barcode,
      defaultValuation: p.defaultValuation,
      isActive: p.isActive,
      reorderPointQuantity: p.reorderPointQuantity?.toString() ?? null,
    }));
    return { data };
  });

  app.post("/products", async (request, reply) => {
    const body = parseBody(createProduct, request.body);
    const { tenantId } = requireCtx(request);
    const sub = await getCurrentSubscription(tenantId);
    if (sub) {
      const features = parsePlanFeatures(sub.plan.features);
      if (features.maxProducts != null) {
        const count = await prisma.product.count({ where: { tenantId } });
        if (count >= features.maxProducts) {
          throw new AppError(
            403,
            "Plan limit",
            `Your plan allows at most ${features.maxProducts} products. Upgrade to add more.`,
          );
        }
      }
    }
    const created = await prisma.product.create({
      data: {
        tenantId,
        sku: body.sku,
        name: body.name,
        description: body.description,
        unitOfMeasure: body.unitOfMeasure ?? "EA",
        defaultValuation: body.defaultValuation ?? "FIFO",
        barcode: body.barcode,
      },
    });
    void reply.code(201);
    return { data: created };
  });

  app.get("/stock-batches", async (request) => {
    const { tenantId } = requireCtx(request);
    const q = z.object({ warehouseId: z.string().uuid().optional() }).parse(request.query);
    const rows = await prisma.stockBatch.findMany({
      where: {
        tenantId,
        ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: { receivedAt: "asc" },
      take: 500,
    });
    const data = rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      productId: r.productId,
      warehouseId: r.warehouseId,
      lotNumber: r.lotNumber,
      serialNumbers: r.serialNumbers,
      quantityOnHand: r.quantityOnHand.toString(),
      receivedAt: r.receivedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      unitCostAmount: r.unitCostAmount.toString(),
      currencyCode: r.currencyCode,
      product: {
        id: r.product.id,
        sku: r.product.sku,
        name: r.product.name,
        barcode: r.product.barcode,
      },
      warehouse: {
        id: r.warehouse.id,
        name: r.warehouse.name,
        code: r.warehouse.code,
      },
    }));
    return { data };
  });

  app.post("/receive", async (request) => {
    const body = parseBody(receive, request.body);
    const ctx = requireCtx(request);
    const result = await receiveStock({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      productId: body.productId,
      warehouseId: body.warehouseId,
      quantity: body.quantity,
      unitCostAmount: body.unitCostAmount,
      currencyCode: body.currencyCode,
      lotNumber: body.lotNumber,
      expiresAt: body.expiresAt,
      ip: request.ip,
    });
    return { data: result };
  });

  app.post("/transfer", async (request) => {
    const body = parseBody(transfer, request.body);
    const ctx = requireCtx(request);
    const result = await transferStock({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      fromWarehouseId: body.fromWarehouseId,
      toWarehouseId: body.toWarehouseId,
      reference: body.reference,
      lines: body.lines,
      ip: request.ip,
    });
    return { data: result };
  });

  app.post("/adjust", async (request) => {
    const body = parseBody(adjustment, request.body);
    const ctx = requireCtx(request);
    const result = await adjustStock({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      stockBatchId: body.stockBatchId,
      quantityDelta: body.quantityDelta,
      reason: body.reason,
      type: body.type,
      ip: request.ip,
    });
    return { data: result };
  });
};
