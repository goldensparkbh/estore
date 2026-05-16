import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "../middleware/tenant.js";
import { recordSaleAnalytics } from "../analytics/clickhouse.js";
import { completeSale, generateEscPosReceipt } from "../services/pos.js";

const paymentMethod = z.enum(["CASH", "CARD", "WALLET", "OTHER"]);

const checkout = z.object({
  currencyCode: z.string().length(3),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.string(),
        unitPrice: z.string(),
        taxRatePercent: z.string(),
        discountAmount: z.string().optional(),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: paymentMethod,
        amount: z.string(),
        reference: z.string().optional(),
      }),
    )
    .min(1),
  offlineQueueId: z.string().optional(),
  localizedAt: z.string().datetime().optional(),
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

export const posRoutes: FastifyPluginAsync = async (app) => {
  app.post("/checkout", async (request) => {
    const body = parseBody(checkout, request.body);
    const ctx = requireCtx(request);
    const sale = await completeSale({
      tenantId: ctx.tenantId,
      cashierUserId: ctx.userId,
      currencyCode: body.currencyCode,
      lines: body.lines,
      payments: body.payments,
      offlineQueueId: body.offlineQueueId,
      localizedAt: body.localizedAt,
      ip: request.ip,
    });
    await recordSaleAnalytics({
      tenantId: ctx.tenantId,
      day: new Date().toISOString().slice(0, 10),
      totalAmount: sale.totalAmount,
    });
    return { data: sale };
  });

  app.get("/receipt/:receiptNumber/escpos", async (request, reply) => {
    requireCtx(request);
    const p = z.object({ receiptNumber: z.string().min(1) }).parse(request.params);
    const buf = generateEscPosReceipt(p.receiptNumber, ["Thank you for your purchase."]);
    void reply.header("content-type", "application/octet-stream");
    return reply.send(buf);
  });

  app.get("/sales/recent", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.sale.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lines: { include: { product: true } }, payments: true },
    });
    const data = rows.map((s) => ({
      id: s.id,
      receiptNumber: s.receiptNumber,
      status: s.status,
      subtotalAmount: s.subtotalAmount.toString(),
      taxAmount: s.taxAmount.toString(),
      totalAmount: s.totalAmount.toString(),
      currencyCode: s.currencyCode,
      offlineQueueId: s.offlineQueueId,
      createdAt: s.createdAt.toISOString(),
      localizedAt: s.localizedAt?.toISOString() ?? null,
      lines: s.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        lineTotal: l.lineTotal.toString(),
        taxRatePercent: l.taxRatePercent.toString(),
        currencyCode: l.currencyCode,
        discountAmount: l.discountAmount.toString(),
        product: { sku: l.product.sku, name: l.product.name },
      })),
      payments: s.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount.toString(),
        currencyCode: p.currencyCode,
        reference: p.reference,
      })),
    }));
    return { data };
  });
};
