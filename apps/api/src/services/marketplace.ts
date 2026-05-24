import type { MarketplacePaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { completeSale } from "./pos.js";
import {
  appBaseUrl,
  calculateMarketplaceSplit,
  mapTapStatus,
  roundMoney,
  tapCreateCharge,
  tapRetrieveCharge,
} from "./tap.js";
import { writeAuditLog } from "./audit.js";

export interface CheckoutLineInput {
  productId: string;
  quantity: string;
}

export interface CreateMarketplaceCheckoutInput {
  tenantId: string;
  tenantSlug: string;
  customerName: string;
  customerEmail: string;
  lines: CheckoutLineInput[];
}

async function getPlatformSettings() {
  return prisma.platformMarketplaceSettings.upsert({
    where: { id: "golden-spark" },
    create: {},
    update: {},
  });
}

function serializeOrder(order: {
  id: string;
  orderNumber: string;
  status: MarketplacePaymentStatus;
  customerName: string;
  customerEmail: string;
  currencyCode: string;
  grossAmount: { toString(): string };
  tapFeeAmount: { toString(): string };
  platformCommissionAmount: { toString(): string };
  tenantNetAmount: { toString(): string };
  commissionRateApplied: { toString(): string };
  tapChargeId: string | null;
  tapChargeStatus: string | null;
  tapRedirectUrl: string | null;
  saleId: string | null;
  createdAt: Date;
  capturedAt: Date | null;
  refundedAt: Date | null;
  tenant?: { name: string; slug: string };
  lines?: Array<{
    sku: string;
    name: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    lineTotal: { toString(): string };
  }>;
  events?: Array<{
    status: MarketplacePaymentStatus;
    tapEvent: string | null;
    note: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    currencyCode: order.currencyCode,
    grossAmount: order.grossAmount.toString(),
    tapFeeAmount: order.tapFeeAmount.toString(),
    platformCommissionAmount: order.platformCommissionAmount.toString(),
    tenantNetAmount: order.tenantNetAmount.toString(),
    commissionRateApplied: order.commissionRateApplied.toString(),
    tapChargeId: order.tapChargeId,
    tapChargeStatus: order.tapChargeStatus,
    tapRedirectUrl: order.tapRedirectUrl,
    saleId: order.saleId,
    tenant: order.tenant,
    lines: order.lines?.map((l) => ({
      sku: l.sku,
      name: l.name,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
    })),
    events: order.events?.map((e) => ({
      status: e.status,
      tapEvent: e.tapEvent,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    capturedAt: order.capturedAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
  };
}

export async function createMarketplaceCheckout(input: CreateMarketplaceCheckoutInput) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: input.tenantId, slug: input.tenantSlug, storeEnabled: true, isSuspended: false },
  });
  if (!tenant) throw new AppError(404, "Not Found", "Store not found.");
  if (!tenant.tapDestinationId) {
    throw new AppError(
      503,
      "Payments unavailable",
      "This store has not connected a TAP merchant account yet.",
    );
  }

  const productIds = input.lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id, id: { in: productIds }, isActive: true, showInStore: true },
  });
  if (products.length !== input.lines.length) {
    throw new AppError(400, "Invalid products", "One or more products are unavailable.");
  }
  const priceMap = new Map(products.map((p) => [p.id, p]));

  let gross = 0;
  const lineRows = input.lines.map((l) => {
    const p = priceMap.get(l.productId)!;
    const unitPrice = Number(p.retailPrice?.toString() ?? "0");
    if (unitPrice <= 0) {
      throw new AppError(400, "No price", `Product ${p.sku} has no retail price.`);
    }
    const qty = Number(l.quantity);
    const lineTotal = unitPrice * qty;
    gross += lineTotal;
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      quantity: l.quantity,
      unitPrice: unitPrice.toFixed(4),
      lineTotal: lineTotal.toFixed(4),
      currencyCode: tenant.baseCurrencyCode,
    };
  });

  const platform = await getPlatformSettings();
  const commissionRate =
    tenant.marketplaceCommissionRate?.toString() ?? platform.defaultCommissionRate.toString();
  const split = calculateMarketplaceSplit({
    gross,
    commissionRatePercent: commissionRate,
    tapFeeRatePercent: platform.estimatedTapFeeRate.toString(),
  });

  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}`;
  const order = await prisma.marketplaceOrder.create({
    data: {
      tenantId: tenant.id,
      orderNumber,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim().toLowerCase(),
      status: "PENDING",
      currencyCode: tenant.baseCurrencyCode,
      grossAmount: split.gross.toFixed(4),
      tapFeeAmount: split.tapFee.toFixed(4),
      platformCommissionAmount: split.platformCommission.toFixed(4),
      tenantNetAmount: split.tenantNet.toFixed(4),
      commissionRateApplied: split.commissionRate.toFixed(4),
      lines: { create: lineRows },
      events: {
        create: {
          status: "PENDING",
          note: "Order created; awaiting TAP checkout.",
        },
      },
    },
  });

  const redirectUrl = `${appBaseUrl()}/store/${tenant.slug}/checkout/return?orderId=${order.id}`;
  const charge = await tapCreateCharge({
    amount: roundMoney(gross),
    currency: tenant.baseCurrencyCode,
    description: `Order ${orderNumber} · ${tenant.name}`,
    orderId: order.id,
    orderNumber,
    customer: {
      firstName: input.customerName.split(" ")[0] || input.customerName,
      email: input.customerEmail,
    },
    redirectUrl,
    tenantDestinationId: tenant.tapDestinationId,
    tenantNetAmount: roundMoney(split.tenantNet.toNumber()),
    metadata: {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    },
  });

  const paymentUrl = charge.transaction?.url ?? charge.redirect?.url ?? null;
  const mapped = mapTapStatus(charge.status);

  const updated = await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: {
      status: mapped,
      tapChargeId: charge.id,
      tapChargeStatus: charge.status,
      tapRedirectUrl: paymentUrl,
      tapReference: charge.reference?.transaction ?? orderNumber,
      events: {
        create: {
          status: mapped,
          tapEvent: charge.status,
          note: "TAP charge initiated.",
          payload: charge as unknown as Prisma.InputJsonValue,
        },
      },
    },
    include: { lines: true, events: { orderBy: { createdAt: "asc" } } },
  });

  if (!paymentUrl) {
    throw new AppError(502, "TAP error", "TAP did not return a checkout URL.");
  }

  return {
    order: serializeOrder(updated),
    paymentUrl,
    split: {
      gross: split.gross.toFixed(4),
      tapFee: split.tapFee.toFixed(4),
      platformCommission: split.platformCommission.toFixed(4),
      tenantNet: split.tenantNet.toFixed(4),
      commissionRate: split.commissionRate.toFixed(4),
      tapFeeRate: split.tapFeeRate.toFixed(4),
      platformName: platform.platformName,
    },
  };
}

export async function syncMarketplaceOrderFromTap(orderId: string) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order || !order.tapChargeId) {
    throw new AppError(404, "Not Found", "Marketplace order not found.");
  }

  const charge = await tapRetrieveCharge(order.tapChargeId);
  return applyTapChargeUpdate(order.id, charge, "poll");
}

export async function applyTapChargeUpdate(
  orderId: string,
  charge: Awaited<ReturnType<typeof tapRetrieveCharge>>,
  source: string,
) {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: { lines: true, tenant: true },
  });
  if (!order) return null;

  const mapped = mapTapStatus(charge.status);
  const alreadyCaptured = order.status === "CAPTURED" && mapped === "CAPTURED";

  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: {
      status: mapped,
      tapChargeStatus: charge.status,
      ...(mapped === "CAPTURED" && !order.capturedAt ? { capturedAt: new Date() } : {}),
      ...(mapped === "REFUNDED" || mapped === "PARTIALLY_REFUNDED"
        ? { refundedAt: new Date() }
        : {}),
      events: {
        create: {
          status: mapped,
          tapEvent: charge.status,
          note: `Updated from ${source}.`,
          payload: charge as unknown as Prisma.InputJsonValue,
        },
      },
    },
  });

  if (mapped === "CAPTURED" && !order.saleId && !alreadyCaptured) {
    await fulfillMarketplaceOrder(order.id);
  }

  return getMarketplaceOrder(order.id);
}

async function fulfillMarketplaceOrder(orderId: string) {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: { lines: true, tenant: true },
  });
  if (!order || order.saleId) return;

  const cashier = await prisma.user.findFirst({
    where: { tenantId: order.tenantId, role: "OWNER", isActive: true },
  });
  if (!cashier) return;

  const sale = await completeSale({
    tenantId: order.tenantId,
    cashierUserId: cashier.id,
    currencyCode: order.currencyCode,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      taxRatePercent: "0",
    })),
    payments: [
      {
        method: "CARD",
        amount: order.grossAmount.toString(),
        reference: order.tapChargeId ?? order.orderNumber,
      },
    ],
  });

  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: { saleId: sale.saleId },
  });

  await writeAuditLog({
    tenantId: order.tenantId,
    userId: cashier.id,
    action: "MARKETPLACE_ORDER_CAPTURED",
    entityName: "MarketplaceOrder",
    entityId: order.id,
    newValues: {
      orderNumber: order.orderNumber,
      saleId: sale.saleId,
      gross: order.grossAmount.toString(),
      platformCommission: order.platformCommissionAmount.toString(),
      tenantNet: order.tenantNetAmount.toString(),
      tapFee: order.tapFeeAmount.toString(),
    },
  });
}

export async function getMarketplaceOrder(orderId: string, tenantId?: string) {
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, ...(tenantId ? { tenantId } : {}) },
    include: {
      lines: true,
      tenant: { select: { name: true, slug: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw new AppError(404, "Not Found", "Marketplace order not found.");
  return serializeOrder(order);
}

export async function listMarketplaceOrders(opts: {
  tenantId?: string;
  status?: MarketplacePaymentStatus;
  limit?: number;
}) {
  const rows = await prisma.marketplaceOrder.findMany({
    where: {
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
    include: {
      tenant: { select: { name: true, slug: true } },
      lines: true,
    },
  });
  return rows.map(serializeOrder);
}

export { getPlatformSettings, serializeOrder };
