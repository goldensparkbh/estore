import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function writeAuditLog(params: {
  tenantId: string;
  userId: string;
  action: string;
  entityName: string;
  entityId: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      entityName: params.entityName,
      entityId: params.entityId,
      oldValues: params.oldValues ?? undefined,
      newValues: params.newValues ?? undefined,
      ipAddress: params.ipAddress ?? undefined,
    },
  });
}
