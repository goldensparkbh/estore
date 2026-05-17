import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const freeFeatures = {
  modules: { inventory: true, pos: true, hr: false },
  maxWarehouses: 1,
  maxProducts: 200,
  maxUsers: 3,
};

const businessFeatures = {
  modules: { inventory: true, pos: true, hr: true },
  maxWarehouses: 50,
  maxProducts: 50000,
  maxUsers: 200,
};

async function seedPlans(): Promise<void> {
  await prisma.subscriptionPlan.upsert({
    where: { slug: "free" },
    create: {
      name: "Starter",
      slug: "free",
      description: "Free tier with Inventory + POS. HR and higher limits require a paid plan.",
      billingInterval: null,
      priceAmount: "0",
      currencyCode: "USD",
      isFreeTier: true,
      features: freeFeatures,
      sortOrder: 0,
    },
    update: {
      name: "Starter",
      description: "Free tier with Inventory + POS. HR and higher limits require a paid plan.",
      features: freeFeatures,
      isFreeTier: true,
      billingInterval: null,
      priceAmount: "0",
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: "business-monthly" },
    create: {
      name: "Business",
      slug: "business-monthly",
      description: "Full modules, billed monthly.",
      billingInterval: "MONTHLY",
      priceAmount: "99",
      currencyCode: "USD",
      isFreeTier: false,
      trialDays: 14,
      features: businessFeatures,
      sortOrder: 10,
    },
    update: {
      name: "Business",
      description: "Full modules, billed monthly.",
      priceAmount: "99",
      features: businessFeatures,
      billingInterval: "MONTHLY",
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: "business-annual" },
    create: {
      name: "Business (Annual)",
      slug: "business-annual",
      description: "Full modules, best value when paid yearly.",
      billingInterval: "ANNUAL",
      priceAmount: "990",
      currencyCode: "USD",
      isFreeTier: false,
      trialDays: 14,
      features: businessFeatures,
      sortOrder: 20,
    },
    update: {
      name: "Business (Annual)",
      description: "Full modules, best value when paid yearly.",
      priceAmount: "990",
      features: businessFeatures,
      billingInterval: "ANNUAL",
    },
  });
}

async function main(): Promise<void> {
  await prisma.currency.upsert({
    where: { code: "USD" },
    create: { code: "USD", symbol: "$", exchangeRate: "1.0000" },
    update: { symbol: "$", exchangeRate: "1.0000" },
  });
  await prisma.currency.upsert({
    where: { code: "EUR" },
    create: { code: "EUR", symbol: "€", exchangeRate: "1.0800" },
    update: {},
  });

  await seedPlans();

  const adminEmail = process.env.SEED_PLATFORM_ADMIN_EMAIL?.toLowerCase().trim();
  const adminPass = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (adminEmail && adminPass) {
    const passwordHash = await bcrypt.hash(adminPass, 12);
    await prisma.platformAdmin.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        displayName: "Platform Operator",
        passwordHash,
      },
      update: { passwordHash },
    });
    // eslint-disable-next-line no-console -- seed script
    console.info("Platform admin:", adminEmail);
  } else {
    // eslint-disable-next-line no-console -- seed script
    console.warn(
      "Skipped platform admin — set SEED_PLATFORM_ADMIN_EMAIL and SEED_PLATFORM_ADMIN_PASSWORD in repo root .env",
    );
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    create: {
      name: "Demo Tenant",
      slug: "demo",
      timezone: "America/New_York",
      baseCurrencyCode: "USD",
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash("changeme", 12);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "owner@demo.local" } },
    create: {
      tenantId: tenant.id,
      email: "owner@demo.local",
      displayName: "Demo Owner",
      passwordHash,
      role: "OWNER",
    },
    update: { passwordHash, role: "OWNER" },
  });

  const bizPlan = await prisma.subscriptionPlan.findUnique({
    where: { slug: "business-monthly" },
  });
  if (bizPlan) {
    const existing = await prisma.tenantSubscription.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
    });
    if (!existing) {
      const end = new Date();
      end.setUTCMonth(end.getUTCMonth() + 1);
      await prisma.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: bizPlan.id,
          status: "ACTIVE",
          currentPeriodEnd: end,
        },
      });
    }
  }

  await prisma.warehouse.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: "MAIN" },
    },
    create: {
      tenantId: tenant.id,
      name: "Main Warehouse",
      code: "MAIN",
      addressLine: "1 Enterprise Way",
    },
    update: {},
  });

  await prisma.product.upsert({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "SKU-001" } },
    create: {
      tenantId: tenant.id,
      sku: "SKU-001",
      name: "Demo Item",
      defaultValuation: "FIFO",
      barcode: "5901234123457",
    },
    update: {},
  });

  // eslint-disable-next-line no-console -- seed script
  console.info("Seed OK. Demo tenant slug: demo | Tenant ID:", tenant.id, "| User ID:", user.id);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console -- seed script
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
