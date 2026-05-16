import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { addBillingPeriod } from "./billing.js";

function slugifyOrg(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base.length > 0 ? base : "org";
}

async function uniqueTenantSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 8; i++) {
    const exists = await prisma.tenant.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface SignupInput {
  organizationName: string;
  email: string;
  password: string;
  planSlug: string;
  displayName?: string;
}

export interface AuthIdentity {
  tenantId: string;
  userId: string;
  tenantSlug: string;
  email: string;
  displayName: string;
  role: string;
}

export async function signupTenantUser(input: SignupInput): Promise<AuthIdentity> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { slug: input.planSlug, isActive: true },
  });
  if (!plan) {
    throw new AppError(400, "Invalid plan", "Select a valid subscription package.");
  }

  const slug = await uniqueTenantSlug(slugifyOrg(input.organizationName));
  const passwordHash = await bcrypt.hash(input.password, 12);
  const displayName = input.displayName?.trim() || input.email.split("@")[0] || "Owner";

  const tenant = await prisma.tenant.create({
    data: {
      name: input.organizationName.trim(),
      slug,
      baseCurrencyCode: plan.currencyCode,
      users: {
        create: {
          email: input.email.toLowerCase().trim(),
          displayName,
          passwordHash,
          role: "OWNER",
        },
      },
      tenantSubscriptions: {
        create: {
          planId: plan.id,
          status: "ACTIVE",
          currentPeriodEnd: addBillingPeriod(new Date(), plan.billingInterval, plan.isFreeTier),
        },
      },
    },
    include: { users: true },
  });

  const user = tenant.users[0];
  if (!user) {
    throw new AppError(500, "Signup failed", "User was not created.");
  }

  return {
    tenantId: tenant.id,
    userId: user.id,
    tenantSlug: tenant.slug,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export interface LoginInput {
  email: string;
  password: string;
  tenantSlug: string;
}

export async function loginTenantUser(input: LoginInput): Promise<AuthIdentity> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: input.tenantSlug.trim().toLowerCase() },
    include: { users: { where: { email: input.email.toLowerCase().trim() } } },
  });
  if (!tenant || tenant.users.length === 0) {
    throw new AppError(401, "Invalid credentials", "Check organization, email, and password.");
  }
  const user = tenant.users[0];
  if (!user.isActive) {
    throw new AppError(403, "Account disabled", "Contact your administrator.");
  }
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw new AppError(401, "Invalid credentials", "Check organization, email, and password.");
  }

  return {
    tenantId: tenant.id,
    userId: user.id,
    tenantSlug: tenant.slug,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export async function authenticateTenantOwnerForBilling(
  tenantId: string,
  userId: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, isActive: true },
  });
  if (!user) {
    throw new AppError(403, "Forbidden", "User not found for tenant.");
  }
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new AppError(403, "Forbidden", "Only organization owners can change billing.");
  }
}
