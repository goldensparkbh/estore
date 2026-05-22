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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReceiptHtml(p: {
  orgName: string;
  receiptNumber: string;
  createdAt: Date;
  currencyCode: string;
  subtotal: string;
  tax: string;
  total: string;
  lines: { sku: string; name: string; quantity: string; unitPrice: string; lineTotal: string }[];
  payments: { method: string; amount: string; reference: string | null }[];
}): string {
  const linesHtml = p.lines
    .map(
      (l) => `<tr>
  <td class="qty">${escapeHtml(l.quantity)}</td>
  <td><div class="nm">${escapeHtml(l.name)}</div><div class="sku">${escapeHtml(l.sku)}</div></td>
  <td class="num">${escapeHtml(l.unitPrice)}</td>
  <td class="num">${escapeHtml(l.lineTotal)}</td>
</tr>`,
    )
    .join("");
  const paymentsHtml = p.payments
    .map(
      (pay) =>
        `<div class="pay"><span>${escapeHtml(pay.method)}${pay.reference ? ` · ${escapeHtml(pay.reference)}` : ""}</span><span>${escapeHtml(p.currencyCode)} ${escapeHtml(pay.amount)}</span></div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(p.receiptNumber)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: ui-monospace, Menlo, Consolas, monospace; margin: 24px; color: #111; max-width: 360px; }
  h1 { font-size: 16px; margin: 0; text-align: center; }
  .sub { text-align: center; font-size: 12px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 4px 0; text-align: left; }
  td.qty { width: 28px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .nm { font-weight: 600; }
  .sku { color: #888; font-size: 10px; }
  hr { border: none; border-top: 1px dashed #999; margin: 12px 0; }
  .totals { font-size: 13px; }
  .totals > div { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .grand { font-size: 15px; font-weight: 700; border-top: 1px solid #000; padding-top: 6px; margin-top: 4px; }
  .pay { display: flex; justify-content: space-between; font-size: 12px; }
  .foot { text-align: center; margin-top: 16px; font-size: 11px; color: #666; }
  .actions { text-align: center; margin-top: 16px; }
  .actions button { padding: 6px 14px; font-size: 12px; cursor: pointer; }
  @media print { .actions { display: none; } body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(p.orgName)}</h1>
  <div class="sub">Receipt ${escapeHtml(p.receiptNumber)} · ${p.createdAt.toLocaleString()}</div>
  <table>
    <thead>
      <tr><th>Qty</th><th>Item</th><th class="num">Price</th><th class="num">Total</th></tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <hr/>
  <div class="totals">
    <div><span>Subtotal</span><span>${escapeHtml(p.currencyCode)} ${escapeHtml(p.subtotal)}</span></div>
    <div><span>Tax</span><span>${escapeHtml(p.currencyCode)} ${escapeHtml(p.tax)}</span></div>
    <div class="grand"><span>Total</span><span>${escapeHtml(p.currencyCode)} ${escapeHtml(p.total)}</span></div>
  </div>
  <hr/>
  ${paymentsHtml}
  <div class="foot">Thank you for your purchase.</div>
  <div class="actions"><button onclick="window.print()">Print</button></div>
</body>
</html>`;
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

  app.get("/receipt/:receiptNumber/html", async (request, reply) => {
    const ctx = requireCtx(request);
    const p = z.object({ receiptNumber: z.string().min(1) }).parse(request.params);
    const sale = await prisma.sale.findFirst({
      where: { tenantId: ctx.tenantId, receiptNumber: p.receiptNumber },
      include: {
        lines: { include: { product: true } },
        payments: true,
        tenant: { select: { name: true, slug: true, baseCurrencyCode: true } },
      },
    });
    if (!sale) throw new AppError(404, "Not found", "Receipt not found.");

    const html = renderReceiptHtml({
      orgName: sale.tenant.name,
      receiptNumber: sale.receiptNumber,
      createdAt: sale.createdAt,
      currencyCode: sale.currencyCode,
      subtotal: sale.subtotalAmount.toString(),
      tax: sale.taxAmount.toString(),
      total: sale.totalAmount.toString(),
      lines: sale.lines.map((l) => ({
        sku: l.product.sku,
        name: l.product.name,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        lineTotal: l.lineTotal.toString(),
      })),
      payments: sale.payments.map((p) => ({
        method: p.method,
        amount: p.amount.toString(),
        reference: p.reference,
      })),
    });
    void reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  app.get("/sales/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const sale = await prisma.sale.findFirst({
      where: { tenantId: ctx.tenantId, id: p.id },
      include: {
        lines: { include: { product: true } },
        payments: true,
      },
    });
    if (!sale) throw new AppError(404, "Not found", "Sale not found.");
    return {
      data: {
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        status: sale.status,
        subtotalAmount: sale.subtotalAmount.toString(),
        taxAmount: sale.taxAmount.toString(),
        totalAmount: sale.totalAmount.toString(),
        currencyCode: sale.currencyCode,
        createdAt: sale.createdAt.toISOString(),
        lines: sale.lines.map((l) => ({
          id: l.id,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
          product: { sku: l.product.sku, name: l.product.name },
        })),
        payments: sale.payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount.toString(),
          currencyCode: p.currencyCode,
          reference: p.reference,
        })),
      },
    };
  });

  app.get("/sales/metrics", async (request) => {
    const ctx = requireCtx(request);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const last30 = new Date(now);
    last30.setUTCDate(last30.getUTCDate() - 30);

    const [today, month, lifetime] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          tenantId: ctx.tenantId,
          status: "COMPLETED",
          createdAt: { gte: todayStart },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: {
          tenantId: ctx.tenantId,
          status: "COMPLETED",
          createdAt: { gte: last30 },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: { tenantId: ctx.tenantId, status: "COMPLETED" },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      data: {
        today: {
          count: today._count._all,
          total: today._sum.totalAmount?.toString() ?? "0",
        },
        last30Days: {
          count: month._count._all,
          total: month._sum.totalAmount?.toString() ?? "0",
        },
        lifetime: {
          count: lifetime._count._all,
          total: lifetime._sum.totalAmount?.toString() ?? "0",
        },
      },
    };
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
