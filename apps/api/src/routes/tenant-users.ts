import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "../middleware/tenant.js";

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

async function requireAdminish(request: FastifyRequest): Promise<{
  tenantId: string;
  userId: string;
  role: string;
}> {
  const ctx = requireCtx(request);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (me.role !== "OWNER" && me.role !== "ADMIN") {
    throw new AppError(403, "Forbidden", "Only owners or admins can manage workspace users.");
  }
  return { tenantId: ctx.tenantId, userId: ctx.userId, role: me.role };
}

export const tenantUserRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const ctx = requireCtx(request);
    const users = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    return {
      data: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  });

  app.post("/", async (request) => {
    const me = await requireAdminish(request);
    const body = parseBody(
      z.object({
        email: z.string().email(),
        password: z.string().min(10).max(200),
        displayName: z.string().min(1).max(120),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
      }),
      request.body,
    );

    if (body.role === "OWNER" && me.role !== "OWNER") {
      throw new AppError(403, "Forbidden", "Only owners can grant the OWNER role.");
    }

    const conflict = await prisma.user.findFirst({
      where: { tenantId: me.tenantId, email: body.email.toLowerCase().trim() },
    });
    if (conflict) throw new AppError(409, "Conflict", "Email already exists in this workspace.");

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        tenantId: me.tenantId,
        email: body.email.toLowerCase().trim(),
        displayName: body.displayName.trim(),
        passwordHash,
        role: body.role,
      },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: me.tenantId,
        userId: me.userId,
        action: "USER_CREATED",
        entityName: "User",
        entityId: user.id,
        newValues: { email: user.email, role: user.role } as Prisma.InputJsonValue,
      },
    });

    return {
      data: {
        ...user,
        createdAt: user.createdAt.toISOString(),
      },
    };
  });

  app.patch("/:userId", async (request) => {
    const me = await requireAdminish(request);
    const p = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        displayName: z.string().min(1).max(120).optional(),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(10).max(200).optional(),
      }),
      request.body,
    );

    const existing = await prisma.user.findFirst({
      where: { id: p.userId, tenantId: me.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "User not found.");

    if (body.role && body.role !== existing.role) {
      if (me.role !== "OWNER") {
        throw new AppError(403, "Forbidden", "Only owners can change roles.");
      }
    }

    if (existing.role === "OWNER" && (body.role && body.role !== "OWNER") || (body.isActive === false && existing.role === "OWNER")) {
      const otherOwners = await prisma.user.count({
        where: {
          tenantId: me.tenantId,
          role: "OWNER",
          isActive: true,
          id: { not: existing.id },
        },
      });
      if (otherOwners === 0) {
        throw new AppError(
          400,
          "Last owner",
          "There must be at least one active owner. Promote another user first.",
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: body.displayName,
        role: body.role,
        isActive: body.isActive,
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 12) } : {}),
      },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: me.tenantId,
        userId: me.userId,
        action: "USER_UPDATED",
        entityName: "User",
        entityId: updated.id,
        oldValues: {
          role: existing.role,
          isActive: existing.isActive,
          displayName: existing.displayName,
        } as Prisma.InputJsonValue,
        newValues: {
          role: updated.role,
          isActive: updated.isActive,
          displayName: updated.displayName,
          passwordChanged: Boolean(body.password),
        } as Prisma.InputJsonValue,
      },
    });

    return { data: { ...updated, createdAt: updated.createdAt.toISOString() } };
  });

  app.delete("/:userId", async (request) => {
    const me = await requireAdminish(request);
    const p = z.object({ userId: z.string().uuid() }).parse(request.params);

    const existing = await prisma.user.findFirst({
      where: { id: p.userId, tenantId: me.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "User not found.");
    if (existing.id === me.userId) {
      throw new AppError(400, "Self", "You cannot deactivate your own account.");
    }
    if (existing.role === "OWNER") {
      const otherOwners = await prisma.user.count({
        where: {
          tenantId: me.tenantId,
          role: "OWNER",
          isActive: true,
          id: { not: existing.id },
        },
      });
      if (otherOwners === 0) {
        throw new AppError(
          400,
          "Last owner",
          "Cannot deactivate the only active owner. Promote another user first.",
        );
      }
    }

    await prisma.user.update({ where: { id: existing.id }, data: { isActive: false } });
    await prisma.auditLog.create({
      data: {
        tenantId: me.tenantId,
        userId: me.userId,
        action: "USER_DEACTIVATED",
        entityName: "User",
        entityId: existing.id,
      },
    });

    return { data: { id: existing.id, deactivated: true } };
  });
};
