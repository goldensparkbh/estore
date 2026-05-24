import type { FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "./tenant.js";

export type TenantRole = "OWNER" | "ADMIN" | "MEMBER";

export async function requireRole(
  request: FastifyRequest,
  allowed: TenantRole[],
): Promise<{ tenantId: string; userId: string; role: TenantRole }> {
  const ctx = requireCtx(request);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const role = me.role as TenantRole;
  if (!allowed.includes(role)) {
    throw new AppError(
      403,
      "Forbidden",
      `This action requires one of: ${allowed.join(", ")}.`,
    );
  }
  return { tenantId: ctx.tenantId, userId: ctx.userId, role };
}
