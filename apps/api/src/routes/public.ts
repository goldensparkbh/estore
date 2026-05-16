import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { signupTenantUser, loginTenantUser } from "../services/auth.js";

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
