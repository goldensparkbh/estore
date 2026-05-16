import type { Prisma, StockMovementType } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { writeAuditLog } from "./audit.js";

function toDecimal(n: string | number): Decimal {
  return new Decimal(n);
}

export interface ReceiveStockInput {
  tenantId: string;
  userId: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  unitCostAmount: string;
  currencyCode: string;
  lotNumber?: string;
  expiresAt?: string;
  ip?: string | null;
}

export async function receiveStock(
  input: ReceiveStockInput,
): Promise<{ batchId: string; movementId: string }> {
  const qty = toDecimal(input.quantity);
  if (qty.lte(0)) {
    throw new AppError(400, "Invalid Quantity", "Quantity must be positive.");
  }
  const cost = toDecimal(input.unitCostAmount);
  if (cost.lt(0)) {
    throw new AppError(400, "Invalid Cost", "Unit cost cannot be negative.");
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: input.tenantId },
  });
  if (!product) {
    throw new AppError(404, "Not Found", "Product not found for tenant.");
  }
  const wh = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, tenantId: input.tenantId },
  });
  if (!wh) {
    throw new AppError(404, "Not Found", "Warehouse not found for tenant.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          tenantId: input.tenantId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          lotNumber: input.lotNumber,
          quantityOnHand: qty.toFixed(4),
          unitCostAmount: cost.toFixed(4),
          currencyCode: input.currencyCode,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          type: "RECEIPT",
          toWarehouseId: input.warehouseId,
          performedById: input.userId,
          lines: {
            create: [
              {
                stockBatchId: batch.id,
                quantityDelta: qty.toFixed(4),
                unitCostAmount: cost.toFixed(4),
                currencyCode: input.currencyCode,
              },
            ],
          },
        },
      });

      return { batchId: batch.id, movementId: movement.id };
    });

    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "STOCK_RECEIPT",
      entityName: "StockBatch",
      entityId: result.batchId,
      newValues: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: qty.toString(),
      },
      ipAddress: input.ip,
    });

    await evaluateReorderTriggers(
      input.tenantId,
      input.userId,
      input.productId,
      input.warehouseId,
    );

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transaction failed";
    throw new AppError(409, "Conflict", msg);
  }
}

export interface TransferStockLineInput {
  stockBatchId: string;
  quantity: string;
}

export interface TransferStockInput {
  tenantId: string;
  userId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: TransferStockLineInput[];
  reference?: string;
  ip?: string | null;
}

export async function transferStock(input: TransferStockInput): Promise<{ movementId: string }> {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new AppError(400, "Invalid Transfer", "Source and destination must differ.");
  }
  if (input.lines.length === 0) {
    throw new AppError(400, "Invalid Transfer", "At least one line is required.");
  }

  const [fromWh, toWh] = await Promise.all([
    prisma.warehouse.findFirst({
      where: { id: input.fromWarehouseId, tenantId: input.tenantId },
    }),
    prisma.warehouse.findFirst({
      where: { id: input.toWarehouseId, tenantId: input.tenantId },
    }),
  ]);
  if (!fromWh || !toWh) {
    throw new AppError(404, "Not Found", "Warehouse not found for tenant.");
  }

  try {
    const movementId = await prisma.$transaction(async (tx) => {
      const outMovement = await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          type: "TRANSFER_OUT",
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          reference: input.reference,
          performedById: input.userId,
        },
      });

      const inMovement = await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          type: "TRANSFER_IN",
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          reference: input.reference,
          performedById: input.userId,
        },
      });

      for (const line of input.lines) {
        const qty = toDecimal(line.quantity);
        if (qty.lte(0)) {
          throw new AppError(400, "Invalid Quantity", "Line quantity must be positive.");
        }
        const batch = await tx.stockBatch.findFirst({
          where: { id: line.stockBatchId, tenantId: input.tenantId, warehouseId: input.fromWarehouseId },
        });
        if (!batch) {
          throw new AppError(404, "Not Found", "Stock batch not in source warehouse.");
        }
        const onHand = toDecimal(batch.quantityOnHand.toString());
        if (onHand.lt(qty)) {
          throw new AppError(400, "Insufficient Stock", "Batch quantity exceeded.");
        }

        await tx.stockBatch.update({
          where: { id: batch.id },
          data: {
            quantityOnHand: onHand.minus(qty).toFixed(4),
          },
        });

        await tx.stockMovementLine.create({
          data: {
            movementId: outMovement.id,
            stockBatchId: batch.id,
            quantityDelta: qty.neg().toFixed(4),
            unitCostAmount: batch.unitCostAmount.toString(),
            currencyCode: batch.currencyCode,
          },
        });

        const newBatch = await tx.stockBatch.create({
          data: {
            tenantId: input.tenantId,
            productId: batch.productId,
            warehouseId: input.toWarehouseId,
            lotNumber: batch.lotNumber,
            serialNumbers: batch.serialNumbers,
            quantityOnHand: qty.toFixed(4),
            receivedAt: batch.receivedAt,
            expiresAt: batch.expiresAt,
            unitCostAmount: batch.unitCostAmount,
            currencyCode: batch.currencyCode,
          },
        });

        await tx.stockMovementLine.create({
          data: {
            movementId: inMovement.id,
            stockBatchId: newBatch.id,
            quantityDelta: qty.toFixed(4),
            unitCostAmount: batch.unitCostAmount.toString(),
            currencyCode: batch.currencyCode,
          },
        });
      }

      return inMovement.id;
    });

    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "STOCK_TRANSFER",
      entityName: "StockMovement",
      entityId: movementId,
      newValues: {
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        lines: input.lines,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: input.ip,
    });

    return { movementId };
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : "Transaction failed";
    throw new AppError(409, "Conflict", msg);
  }
}

export interface AdjustmentInput {
  tenantId: string;
  userId: string;
  stockBatchId: string;
  quantityDelta: string;
  reason: string;
  type: Extract<StockMovementType, "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE" | "WASTAGE">;
  ip?: string | null;
}

export async function adjustStock(input: AdjustmentInput): Promise<{ movementId: string }> {
  const amount = toDecimal(input.quantityDelta).abs();
  if (amount.lte(0)) {
    throw new AppError(400, "Invalid Adjustment", "Quantity delta must be non-zero.");
  }

  const batch = await prisma.stockBatch.findFirst({
    where: { id: input.stockBatchId, tenantId: input.tenantId },
    include: { warehouse: true },
  });
  if (!batch) {
    throw new AppError(404, "Not Found", "Stock batch not found.");
  }

  const signed =
    input.type === "ADJUSTMENT_INCREASE" ? amount : amount.neg();
  const onHand = toDecimal(batch.quantityOnHand.toString());
  if (signed.lt(0) && onHand.lt(signed.abs())) {
    throw new AppError(400, "Insufficient Stock", "Cannot decrease below zero.");
  }

  try {
    const movementId = await prisma.$transaction(async (tx) => {
      const newQty = onHand.plus(signed);
      if (newQty.lt(0)) {
        throw new Error("Negative stock");
      }
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { quantityOnHand: newQty.toFixed(4) },
      });

      const mv = await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          type: input.type,
          fromWarehouseId: batch.warehouseId,
          toWarehouseId: batch.warehouseId,
          reason: input.reason,
          performedById: input.userId,
          lines: {
            create: [
              {
                stockBatchId: batch.id,
                quantityDelta: signed.toFixed(4),
                unitCostAmount: batch.unitCostAmount.toString(),
                currencyCode: batch.currencyCode,
              },
            ],
          },
        },
      });
      return mv.id;
    });

    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "STOCK_ADJUST",
      entityName: "StockMovement",
      entityId: movementId,
      newValues: { type: input.type, delta: signed.toString(), reason: input.reason },
      ipAddress: input.ip,
    });

    return { movementId };
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : "Transaction failed";
    throw new AppError(409, "Conflict", msg);
  }
}

async function evaluateReorderTriggers(
  tenantId: string,
  userId: string,
  productId: string,
  warehouseId: string,
): Promise<void> {
  const rules = await prisma.reorderRule.findMany({
    where: { tenantId, productId, warehouseId, isActive: true },
  });
  if (rules.length === 0) return;

  const agg = await prisma.stockBatch.aggregate({
    where: { tenantId, productId, warehouseId },
    _sum: { quantityOnHand: true },
  });
  const onHand = agg._sum.quantityOnHand
    ? toDecimal(agg._sum.quantityOnHand.toString())
    : toDecimal(0);

  const now = new Date();
  for (const rule of rules) {
    const min = toDecimal(rule.minimumQuantity.toString());
    if (onHand.lte(min)) {
      await prisma.reorderRule.update({
        where: { id: rule.id },
        data: { lastTriggeredAt: now },
      });
      await writeAuditLog({
        tenantId,
        userId,
        action: "REORDER_TRIGGER",
        entityName: "ReorderRule",
        entityId: rule.id,
        newValues: { onHand: onHand.toString(), minimum: min.toString() },
      });
    }
  }
}
