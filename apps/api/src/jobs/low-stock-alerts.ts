import { prisma } from "../lib/prisma.js";
import { sendPlatformEmail } from "../services/email.js";
import { writeAuditLog } from "../services/audit.js";

const MS_PER_DAY = 86_400_000;
const EMAIL_COOLDOWN_MS = MS_PER_DAY;

export interface LowStockAlert {
  tenantId: string;
  tenantName: string;
  email: string;
  ruleId: string;
  productSku: string;
  productName: string;
  warehouseCode: string;
  onHand: string;
  minimumQuantity: string;
  reorderQuantity: string;
}

export async function findLowStockAlerts(): Promise<LowStockAlert[]> {
  const rules = await prisma.reorderRule.findMany({
    where: { isActive: true },
    include: {
      tenant: { select: { id: true, name: true, billingEmail: true } },
      product: { select: { sku: true, name: true } },
      warehouse: { select: { code: true } },
    },
  });
  if (rules.length === 0) return [];

  const sums = await prisma.stockBatch.groupBy({
    by: ["tenantId", "productId", "warehouseId"],
    where: {
      productId: { in: rules.map((r) => r.productId) },
      warehouseId: { in: rules.map((r) => r.warehouseId) },
    },
    _sum: { quantityOnHand: true },
  });

  const onHand = new Map<string, number>();
  for (const s of sums) {
    onHand.set(
      `${s.tenantId}::${s.productId}::${s.warehouseId}`,
      Number(s._sum.quantityOnHand?.toString() ?? "0"),
    );
  }

  const alerts: LowStockAlert[] = [];
  for (const r of rules) {
    const have = onHand.get(`${r.tenantId}::${r.productId}::${r.warehouseId}`) ?? 0;
    const min = Number(r.minimumQuantity.toString());
    if (have > min) continue;

    const email =
      r.tenant.billingEmail ??
      (await prisma.user.findFirst({
        where: { tenantId: r.tenantId, role: "OWNER", isActive: true },
        select: { email: true },
      }))?.email;
    if (!email) continue;

    if (r.lastEmailSentAt && Date.now() - r.lastEmailSentAt.getTime() < EMAIL_COOLDOWN_MS) {
      continue;
    }

    alerts.push({
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      email,
      ruleId: r.id,
      productSku: r.product.sku,
      productName: r.product.name,
      warehouseCode: r.warehouse.code,
      onHand: have.toString(),
      minimumQuantity: r.minimumQuantity.toString(),
      reorderQuantity: r.reorderQuantity.toString(),
    });
  }
  return alerts;
}

export async function runLowStockAlertJob(): Promise<{ sent: number; skipped: number }> {
  const alerts = await findLowStockAlerts();
  let sent = 0;
  let skipped = 0;

  for (const a of alerts) {
    const subject = `[${a.tenantName}] Low stock: ${a.productSku}`;
    const text = [
      `Product ${a.productName} (${a.productSku}) at warehouse ${a.warehouseCode} is below the reorder threshold.`,
      `On hand: ${a.onHand}`,
      `Minimum: ${a.minimumQuantity}`,
      `Suggested reorder quantity: ${a.reorderQuantity}`,
      "",
      "Open your inventory workspace to receive stock or adjust reorder rules.",
    ].join("\n");

    const result = await sendPlatformEmail({ to: a.email, subject, text });
    if (!result.sent) {
      skipped += 1;
      continue;
    }

    await prisma.reorderRule.update({
      where: { id: a.ruleId },
      data: { lastEmailSentAt: new Date(), lastTriggeredAt: new Date() },
    });

    const owner = await prisma.user.findFirst({
      where: { tenantId: a.tenantId, role: "OWNER", isActive: true },
    });
    if (owner) {
      await writeAuditLog({
        tenantId: a.tenantId,
        userId: owner.id,
        action: "LOW_STOCK_EMAIL",
        entityName: "ReorderRule",
        entityId: a.ruleId,
        newValues: {
          productSku: a.productSku,
          warehouseCode: a.warehouseCode,
          onHand: a.onHand,
        },
      });
    }
    sent += 1;
  }

  return { sent, skipped };
}

let schedulerStarted = false;

/** Runs once at startup (after delay) and then every 24h. */
export function startLowStockScheduler(log: { info: (o: unknown, msg?: string) => void }): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const run = async (): Promise<void> => {
    try {
      const result = await runLowStockAlertJob();
      log.info(result, "low-stock alert job completed");
    } catch (err) {
      log.info({ err }, "low-stock alert job failed");
    }
  };

  // First run 60s after boot so DB is warm; then every 24h.
  setTimeout(() => void run(), 60_000);
  setInterval(() => void run(), MS_PER_DAY);
}
