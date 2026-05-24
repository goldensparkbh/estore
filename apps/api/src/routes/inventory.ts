import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "../middleware/tenant.js";
import { adjustStock, receiveStock, transferStock } from "../services/inventory.js";
import { getCurrentSubscription, parsePlanFeatures } from "../services/billing.js";
import { writeAuditLog } from "../services/audit.js";
import { parseDataUrl, saveProductImage } from "../lib/storage.js";

function serializeProduct(p: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  barcode: string | null;
  defaultValuation: string;
  isActive: boolean;
  retailPrice: { toString(): string } | null;
  imageUrl: string | null;
  showInStore: boolean;
  reorderPointQuantity: { toString(): string } | null;
}) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    category: p.category,
    barcode: p.barcode,
    defaultValuation: p.defaultValuation,
    isActive: p.isActive,
    retailPrice: p.retailPrice?.toString() ?? null,
    imageUrl: p.imageUrl,
    showInStore: p.showInStore,
    reorderPointQuantity: p.reorderPointQuantity?.toString() ?? null,
  };
}

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
  category: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  defaultValuation: z.enum(["FIFO", "LIFO"]).optional(),
  barcode: z.string().optional(),
  retailPrice: z.string().optional(),
  showInStore: z.boolean().optional(),
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

  app.patch("/warehouses/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(createWarehouse.partial(), request.body);
    const existing = await prisma.warehouse.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Warehouse not found.");
    const updated = await prisma.warehouse.update({
      where: { id: existing.id },
      data: body,
    });
    return { data: updated };
  });

  app.delete("/warehouses/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.warehouse.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
      include: { _count: { select: { stockBatches: true } } },
    });
    if (!existing) throw new AppError(404, "Not found", "Warehouse not found.");
    if (existing._count.stockBatches > 0) {
      throw new AppError(
        409,
        "Conflict",
        "Warehouse still has stock batches. Transfer them out first.",
      );
    }
    await prisma.warehouse.delete({ where: { id: existing.id } });
    return { data: { id: existing.id, deleted: true } };
  });

  app.get("/products", async (request) => {
    const { tenantId } = requireCtx(request);
    const rows = await prisma.product.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    const data = rows.map((p) => serializeProduct(p));
    return { data };
  });

  app.post("/products", async (request, reply) => {
    const body = parseBody(createProduct, request.body);
    const ctx = requireCtx(request);
    const sub = await getCurrentSubscription(ctx.tenantId);
    if (sub) {
      const features = parsePlanFeatures(sub.plan.features);
      if (features.maxProducts != null) {
        const count = await prisma.product.count({ where: { tenantId: ctx.tenantId } });
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
        tenantId: ctx.tenantId,
        sku: body.sku,
        name: body.name,
        description: body.description,
        category: body.category,
        unitOfMeasure: body.unitOfMeasure ?? "EA",
        defaultValuation: body.defaultValuation ?? "FIFO",
        barcode: body.barcode,
        retailPrice: body.retailPrice,
        showInStore: body.showInStore ?? false,
      },
    });
    await writeAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PRODUCT_CREATED",
      entityName: "Product",
      entityId: created.id,
      newValues: { sku: created.sku, name: created.name },
      ipAddress: request.ip,
    });
    void reply.code(201);
    return { data: serializeProduct(created) };
  });

  app.patch("/products/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      createProduct
        .partial()
        .extend({
          isActive: z.boolean().optional(),
          reorderPointQuantity: z.string().nullable().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      request.body,
    );
    const existing = await prisma.product.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Product not found.");
    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: {
        sku: body.sku,
        name: body.name,
        description: body.description,
        category: body.category,
        unitOfMeasure: body.unitOfMeasure,
        defaultValuation: body.defaultValuation,
        barcode: body.barcode,
        retailPrice: body.retailPrice,
        showInStore: body.showInStore,
        imageUrl: body.imageUrl === null ? null : body.imageUrl,
        isActive: body.isActive,
        reorderPointQuantity:
          body.reorderPointQuantity === null
            ? null
            : body.reorderPointQuantity ?? undefined,
      },
    });
    await writeAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PRODUCT_UPDATED",
      entityName: "Product",
      entityId: updated.id,
      oldValues: { sku: existing.sku, showInStore: existing.showInStore },
      newValues: { sku: updated.sku, showInStore: updated.showInStore },
      ipAddress: request.ip,
    });
    return { data: serializeProduct(updated) };
  });

  app.post("/products/:id/image", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(z.object({ dataUrl: z.string().min(20) }), request.body);
    const existing = await prisma.product.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Product not found.");
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) throw new AppError(400, "Invalid image", "Expected a base64 data URL.");
    if (parsed.buffer.length > 5 * 1024 * 1024) {
      throw new AppError(400, "Too large", "Image must be under 5 MB.");
    }
    const imageUrl = await saveProductImage(ctx.tenantId, existing.id, parsed.buffer, parsed.mimeType);
    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: { imageUrl },
    });
    await writeAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PRODUCT_IMAGE_UPDATED",
      entityName: "Product",
      entityId: updated.id,
      ipAddress: request.ip,
    });
    return { data: { id: updated.id, imageUrl: updated.imageUrl } };
  });

  app.delete("/products/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.product.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Product not found.");
    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return { data: { id: updated.id, deactivated: true } };
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

  app.get("/reorder-rules", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.reorderRule.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ isActive: "desc" }, { lastTriggeredAt: "desc" }],
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });

    const onHandByPair = new Map<string, string>();
    if (rows.length > 0) {
      const sums = await prisma.stockBatch.groupBy({
        by: ["productId", "warehouseId"],
        where: {
          tenantId: ctx.tenantId,
          productId: { in: rows.map((r) => r.productId) },
          warehouseId: { in: rows.map((r) => r.warehouseId) },
        },
        _sum: { quantityOnHand: true },
      });
      for (const s of sums) {
        onHandByPair.set(
          `${s.productId}::${s.warehouseId}`,
          s._sum.quantityOnHand?.toString() ?? "0",
        );
      }
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        product: r.product,
        warehouse: r.warehouse,
        minimumQuantity: r.minimumQuantity.toString(),
        reorderQuantity: r.reorderQuantity.toString(),
        isActive: r.isActive,
        lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
        onHand: onHandByPair.get(`${r.productId}::${r.warehouseId}`) ?? "0",
      })),
    };
  });

  app.post("/reorder-rules", async (request, reply) => {
    const ctx = requireCtx(request);
    const body = parseBody(
      z.object({
        productId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        minimumQuantity: z.string(),
        reorderQuantity: z.string(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    const created = await prisma.reorderRule.upsert({
      where: {
        tenantId_productId_warehouseId: {
          tenantId: ctx.tenantId,
          productId: body.productId,
          warehouseId: body.warehouseId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        productId: body.productId,
        warehouseId: body.warehouseId,
        minimumQuantity: body.minimumQuantity,
        reorderQuantity: body.reorderQuantity,
        isActive: body.isActive ?? true,
      },
      update: {
        minimumQuantity: body.minimumQuantity,
        reorderQuantity: body.reorderQuantity,
        isActive: body.isActive ?? true,
      },
    });
    void reply.code(201);
    return { data: created };
  });

  app.patch("/reorder-rules/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        minimumQuantity: z.string().optional(),
        reorderQuantity: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    const existing = await prisma.reorderRule.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Reorder rule not found.");
    const updated = await prisma.reorderRule.update({
      where: { id: existing.id },
      data: body,
    });
    return { data: updated };
  });

  app.delete("/reorder-rules/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.reorderRule.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Reorder rule not found.");
    await prisma.reorderRule.delete({ where: { id: existing.id } });
    return { data: { id: existing.id, deleted: true } };
  });

  app.get("/low-stock", async (request) => {
    const ctx = requireCtx(request);
    const rules = await prisma.reorderRule.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });
    if (rules.length === 0) return { data: [] };

    const sums = await prisma.stockBatch.groupBy({
      by: ["productId", "warehouseId"],
      where: {
        tenantId: ctx.tenantId,
        productId: { in: rules.map((r) => r.productId) },
        warehouseId: { in: rules.map((r) => r.warehouseId) },
      },
      _sum: { quantityOnHand: true },
    });

    const onHand = new Map<string, number>();
    for (const s of sums) {
      onHand.set(
        `${s.productId}::${s.warehouseId}`,
        Number(s._sum.quantityOnHand?.toString() ?? "0"),
      );
    }

    const alerts = rules
      .map((r) => {
        const have = onHand.get(`${r.productId}::${r.warehouseId}`) ?? 0;
        const min = Number(r.minimumQuantity.toString());
        return {
          ruleId: r.id,
          product: r.product,
          warehouse: r.warehouse,
          minimumQuantity: r.minimumQuantity.toString(),
          reorderQuantity: r.reorderQuantity.toString(),
          onHand: have.toString(),
          isLow: have <= min,
        };
      })
      .filter((a) => a.isLow);

    return { data: alerts };
  });
};
