import type { FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";

const HEADER = "x-platform-admin-id";

export async function attachPlatformAdmin(request: FastifyRequest): Promise<void> {
  const id = request.headers[HEADER] as string | undefined;
  if (!id) {
    throw new AppError(
      401,
      "Unauthorized",
      "Platform operator session required.",
      "https://erp.example/problems/platform-auth",
    );
  }
  const admin = await prisma.platformAdmin.findFirst({
    where: { id, isActive: true },
    select: { id: true, email: true, displayName: true },
  });
  if (!admin) {
    throw new AppError(401, "Unauthorized", "Invalid platform operator session.");
  }
  request.platformAdmin = admin;
}

export function requirePlatformAdmin(request: FastifyRequest): NonNullable<FastifyRequest["platformAdmin"]> {
  const a = request.platformAdmin;
  if (!a) {
    throw new AppError(500, "Server error", "Platform context missing.");
  }
  return a;
}

export { HEADER as PLATFORM_ADMIN_HEADER };
