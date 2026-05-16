import Decimal from "decimal.js";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { writeAuditLog } from "./audit.js";

function toDec(n: string | number): Decimal {
  return new Decimal(n);
}

export interface CheckoutLineInput {
  productId: string;
  quantity: string;
  unitPrice: string;
  taxRatePercent: string;
  discountAmount?: string;
}

export interface CheckoutPaymentInput {
  method: PaymentMethod;
  amount: string;
  reference?: string;
}

export interface CompleteSaleInput {
  tenantId: string;
  cashierUserId: string;
  currencyCode: string;
  lines: CheckoutLineInput[];
  payments: CheckoutPaymentInput[];
  offlineQueueId?: string;
  localizedAt?: string;
  ip?: string | null;
}

export async function completeSale(
  input: CompleteSaleInput,
): Promise<{ saleId: string; receiptNumber: string; totalAmount: string }> {
  if (input.lines.length === 0) {
    throw new AppError(400, "Invalid Sale", "At least one line item is required.");
  }
  if (input.payments.length === 0) {
    throw new AppError(400, "Invalid Sale", "At least one payment is required.");
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: input.tenantId },
    select: { baseCurrencyCode: true },
  });
  if (!tenant) {
    throw new AppError(404, "Not Found", "Tenant not found.");
  }

  const receiptNumber = `R-${Date.now().toString(36).toUpperCase()}`;

  let subtotal = toDec(0);
  let tax = toDec(0);
  const lineRows: Prisma.SaleLineCreateManyInput[] = [];

  for (const line of input.lines) {
    const product = await prisma.product.findFirst({
      where: { id: line.productId, tenantId: input.tenantId, isActive: true },
    });
    if (!product) {
      throw new AppError(404, "Not Found", `Product ${line.productId} not found.`);
    }
    const qty = toDec(line.quantity);
    const price = toDec(line.unitPrice);
    const disc = toDec(line.discountAmount ?? "0");
    const rate = toDec(line.taxRatePercent).div(100);
    const lineSub = qty.mul(price).minus(disc);
    const lineTax = lineSub.mul(rate);
    const lineTotal = lineSub.plus(lineTax);
    subtotal = subtotal.plus(lineSub);
    tax = tax.plus(lineTax);

    lineRows.push({
      saleId: "",
      productId: product.id,
      quantity: qty.toFixed(4),
      unitPrice: price.toFixed(4),
      lineTotal: lineTotal.toFixed(4),
      taxRatePercent: toDec(line.taxRatePercent).toFixed(4),
      currencyCode: input.currencyCode,
      discountAmount: disc.toFixed(4),
    });
  }

  const total = subtotal.plus(tax);
  const paySum = input.payments.reduce((acc, p) => acc.plus(toDec(p.amount)), toDec(0));
  if (!paySum.eq(total)) {
    throw new AppError(
      400,
      "Payment Mismatch",
      `Payments (${paySum.toFixed(2)}) must equal total (${total.toFixed(2)}).`,
    );
  }

  try {
    const saleId = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          tenantId: input.tenantId,
          receiptNumber,
          status: "COMPLETED",
          subtotalAmount: subtotal.toFixed(4),
          taxAmount: tax.toFixed(4),
          totalAmount: total.toFixed(4),
          currencyCode: input.currencyCode,
          cashierUserId: input.cashierUserId,
          offlineQueueId: input.offlineQueueId,
          localizedAt: input.localizedAt ? new Date(input.localizedAt) : undefined,
        },
      });

      await tx.saleLine.createMany({
        data: lineRows.map((r) => ({
          ...r,
          saleId: sale.id,
        })),
      });

      for (const p of input.payments) {
        await tx.salePayment.create({
          data: {
            saleId: sale.id,
            method: p.method,
            amount: toDec(p.amount).toFixed(4),
            currencyCode: input.currencyCode,
            reference: p.reference,
          },
        });
      }

      await consumeStockForSale(tx, input.tenantId, input.cashierUserId, sale.id, input.lines);

      return sale.id;
    });

    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.cashierUserId,
      action: "POS_SALE_COMPLETE",
      entityName: "Sale",
      entityId: saleId,
      newValues: { receiptNumber, total: total.toString() },
      ipAddress: input.ip,
    });

    return { saleId, receiptNumber, totalAmount: total.toFixed(4) };
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : "Transaction failed";
    throw new AppError(409, "Conflict", msg);
  }
}

async function consumeStockForSale(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  saleId: string,
  lines: CheckoutLineInput[],
): Promise<void> {
  const defaultWarehouse = await tx.warehouse.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!defaultWarehouse) {
    throw new AppError(400, "No Warehouse", "Configure a warehouse before selling stock.");
  }

  for (const line of lines) {
    let remaining = toDec(line.quantity);
    const productRow = await tx.product.findFirst({
      where: { id: line.productId, tenantId },
    });
    if (!productRow) {
      throw new AppError(404, "Not Found", `Product ${line.productId} not found.`);
    }
    const receivedOrder = productRow.defaultValuation === "LIFO" ? "desc" : "asc";
    const batches = await tx.stockBatch.findMany({
      where: { tenantId, productId: line.productId, warehouseId: defaultWarehouse.id },
      orderBy: [{ receivedAt: receivedOrder }],
    });
    if (batches.length === 0) {
      throw new AppError(400, "No Stock", `No stock for product ${line.productId}.`);
    }

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        type: "SALE",
        fromWarehouseId: defaultWarehouse.id,
        reference: saleId,
        performedById: userId,
      },
    });

    for (const batch of batches) {
      if (remaining.lte(0)) break;
      const onHand = toDec(batch.quantityOnHand.toString());
      if (onHand.lte(0)) continue;
      const take = Decimal.min(remaining, onHand);
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { quantityOnHand: onHand.minus(take).toFixed(4) },
      });
      await tx.stockMovementLine.create({
        data: {
          movementId: movement.id,
          stockBatchId: batch.id,
          quantityDelta: take.neg().toFixed(4),
          unitCostAmount: batch.unitCostAmount.toString(),
          currencyCode: batch.currencyCode,
        },
      });
      remaining = remaining.minus(take);
    }

    if (remaining.gt(0)) {
      throw new AppError(400, "Insufficient Stock", "Not enough quantity across batches.");
    }
  }
}

export function generateEscPosReceipt(receiptNumber: string, lines: string[]): Buffer {
  const esc = (ch: number): Buffer => Buffer.from([ch]);
  const chunks: Buffer[] = [
    esc(0x1b),
    Buffer.from("@"), // init
    Buffer.from(`RECEIPT ${receiptNumber}\n`, "ascii"),
    ...lines.map((l) => Buffer.from(`${l}\n`, "ascii")),
    esc(0x1d),
    Buffer.from([0x56, 0x00]), // cut
  ];
  return Buffer.concat(chunks);
}
