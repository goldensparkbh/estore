import type { FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";

export interface TenantContext {
  tenantId: string;
  userId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    ctx?: TenantContext;
    platformAdmin?: { id: string; email: string; displayName: string };
  }
}

const TENANT_HEADER = "x-tenant-id";
const USER_HEADER = "x-user-id";

export async function attachTenantContext(
  request: FastifyRequest,
): Promise<TenantContext> {
  const tenantId = request.headers[TENANT_HEADER] as string | undefined;
  const userId = request.headers[USER_HEADER] as string | undefined;
  if (!tenantId || !userId) {
    throw new AppError(
      401,
      "Unauthorized",
      "Missing tenant or user identity headers.",
      "https://erp.example/problems/missing-identity",
    );
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, isSuspended: true },
  });
  if (!tenant) {
    throw new AppError(403, "Forbidden", "Unknown tenant.", "https://erp.example/problems/tenant-mismatch");
  }
  if (tenant.isSuspended) {
    throw new AppError(
      403,
      "Organization suspended",
      "This workspace has been suspended. Contact platform support.",
      "https://erp.example/problems/tenant-suspended",
    );
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!user) {
    throw new AppError(
      403,
      "Forbidden",
      "User is not active for this tenant.",
      "https://erp.example/problems/tenant-mismatch",
    );
  }
  return { tenantId, userId };
}

export function requireCtx(request: FastifyRequest): TenantContext {
  const ctx = request.ctx;
  if (!ctx) {
    throw new AppError(
      500,
      "Server Misconfiguration",
      "Request context was not initialized.",
    );
  }
  return ctx;
}

export { TENANT_HEADER, USER_HEADER };
