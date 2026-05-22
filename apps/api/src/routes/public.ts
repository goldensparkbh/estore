import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { signupTenantUser, loginTenantUser } from "../services/auth.js";
import { sendPlatformEmail } from "../services/email.js";
import { appBaseUrl } from "../services/stripe.js";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

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

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/plans", async () => {
    const rows = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const data = rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      billingInterval: p.billingInterval,
      priceAmount: p.priceAmount.toString(),
      currencyCode: p.currencyCode,
      isFreeTier: p.isFreeTier,
      trialDays: p.trialDays,
      features: p.features,
      sortOrder: p.sortOrder,
    }));
    return { data };
  });

  app.post("/signup", async (request) => {
    const schema = z.object({
      organizationName: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(10),
      planSlug: z.string().min(1),
      displayName: z.string().optional(),
    });
    const body = parseBody(schema, request.body);
    const identity = await signupTenantUser(body);
    return { data: identity };
  });

  app.post("/login", async (request) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      tenantSlug: z.string().min(1),
    });
    const body = parseBody(schema, request.body);
    const identity = await loginTenantUser(body);
    return { data: identity };
  });

  app.post("/forgot-password", async (request) => {
    const schema = z.object({
      email: z.string().email(),
      tenantSlug: z.string().min(1),
    });
    const body = parseBody(schema, request.body);

    const tenant = await prisma.tenant.findUnique({
      where: { slug: body.tenantSlug.trim().toLowerCase() },
      include: { users: { where: { email: body.email.toLowerCase().trim() } } },
    });

    if (tenant && tenant.users[0] && !tenant.isSuspended) {
      const user = tenant.users[0];
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.passwordReset.create({
        data: { tenantId: tenant.id, userId: user.id, tokenHash, expiresAt },
      });

      const link = `${appBaseUrl()}/reset-password?token=${rawToken}&slug=${encodeURIComponent(
        tenant.slug,
      )}`;

      await sendPlatformEmail({
        to: user.email,
        subject: `Reset your ${tenant.name} password`,
        text:
          `We received a request to reset the password for ${user.email} ` +
          `in ${tenant.name}. Use this link (valid for 1 hour):\n\n${link}\n\n` +
          `If you did not request this, ignore this email.`,
      });
    }

    return { data: { ok: true } };
  });

  app.post("/reset-password", async (request) => {
    const schema = z.object({
      token: z.string().min(20),
      tenantSlug: z.string().min(1),
      newPassword: z.string().min(10).max(200),
    });
    const body = parseBody(schema, request.body);

    const tokenHash = hashToken(body.token);
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new AppError(400, "Invalid token", "Reset link is invalid or expired.");
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: reset.tenantId } });
    if (!tenant || tenant.slug !== body.tenantSlug.trim().toLowerCase()) {
      throw new AppError(400, "Invalid token", "Reset link is invalid.");
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    ]);

    return { data: { ok: true } };
  });

  app.post("/platform/login", async (request) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });
    const body = parseBody(schema, request.body);
    const admin = await prisma.platformAdmin.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    if (!admin || !admin.isActive) {
      throw new AppError(401, "Invalid credentials", "Unknown operator account.");
    }
    const ok = await bcrypt.compare(body.password, admin.passwordHash);
    if (!ok) {
      throw new AppError(401, "Invalid credentials", "Check email and password.");
    }
    return {
      data: {
        adminId: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      },
    };
  });
};
