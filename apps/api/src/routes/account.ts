import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
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

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request) => {
    const ctx = requireCtx(request);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            timezone: true,
            baseCurrencyCode: true,
            billingEmail: true,
            isSuspended: true,
          },
        },
      },
    });
    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
        },
        tenant: user.tenant,
      },
    };
  });

  app.patch("/me", async (request) => {
    const ctx = requireCtx(request);
    const body = parseBody(
      z.object({
        displayName: z.string().min(1).max(120).optional(),
        email: z.string().email().optional(),
      }),
      request.body,
    );

    if (body.email) {
      const conflict = await prisma.user.findFirst({
        where: {
          tenantId: ctx.tenantId,
          email: body.email.toLowerCase().trim(),
          id: { not: ctx.userId },
        },
      });
      if (conflict) throw new AppError(409, "Conflict", "Email already in use.");
    }

    const updated = await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        displayName: body.displayName,
        email: body.email ? body.email.toLowerCase().trim() : undefined,
      },
      select: { id: true, email: true, displayName: true, role: true },
    });
    return { data: updated };
  });

  app.post("/me/change-password", async (request) => {
    const ctx = requireCtx(request);
    const body = parseBody(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(10).max(200),
      }),
      request.body,
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) throw new AppError(400, "Invalid", "Current password is incorrect.");

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { data: { changed: true } };
  });

  app.patch("/tenant", async (request) => {
    const ctx = requireCtx(request);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (me.role !== "OWNER" && me.role !== "ADMIN") {
      throw new AppError(403, "Forbidden", "Only owners or admins can change workspace settings.");
    }
    const body = parseBody(
      z.object({
        name: z.string().min(2).max(200).optional(),
        timezone: z.string().min(1).max(64).optional(),
        baseCurrencyCode: z.string().length(3).optional(),
        billingEmail: z.string().email().nullable().optional(),
      }),
      request.body,
    );

    const updated = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        name: body.name,
        timezone: body.timezone,
        baseCurrencyCode: body.baseCurrencyCode,
        billingEmail:
          body.billingEmail === null
            ? null
            : body.billingEmail
              ? body.billingEmail.trim().toLowerCase()
              : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        baseCurrencyCode: true,
        billingEmail: true,
      },
    });
    return { data: updated };
  });
};
