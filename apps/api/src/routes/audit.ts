import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireCtx } from "../middleware/tenant.js";
import { requireRole } from "../middleware/rbac.js";

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    await requireRole(request, ["OWNER", "ADMIN"]);
    const ctx = requireCtx(request);
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        action: z.string().optional(),
        entityName: z.string().optional(),
      })
      .parse(request.query);

    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(q.action ? { action: q.action } : {}),
        ...(q.entityName ? { entityName: q.entityName } : {}),
      },
      orderBy: { timestamp: "desc" },
      take: q.limit,
      include: {
        user: { select: { id: true, displayName: true, email: true, role: true } },
      },
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityName: r.entityName,
        entityId: r.entityId,
        oldValues: r.oldValues,
        newValues: r.newValues,
        ipAddress: r.ipAddress,
        timestamp: r.timestamp.toISOString(),
        user: r.user,
      })),
    };
  });
};
