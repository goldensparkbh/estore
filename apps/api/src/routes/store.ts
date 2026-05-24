import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { tapConfigured } from "../services/tap.js";
import { sendPlatformEmail } from "../services/email.js";
import {
  serializeStorefront,
  storefrontSelect,
} from "../lib/store-settings.js";
import {
  createMarketplaceCheckout,
  getMarketplaceOrder,
  syncMarketplaceOrderFromTap,
} from "../services/marketplace.js";

export const storeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:slug", async (request) => {
    const p = z.object({ slug: z.string().min(1) }).parse(request.params);
    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, isSuspended: false, storeEnabled: true },
      select: storefrontSelect,
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");
    return { data: serializeStorefront(tenant) };
  });

  app.get("/:slug/legal/:policy", async (request) => {
    const p = z
      .object({
        slug: z.string().min(1),
        policy: z.enum(["terms", "privacy", "refund"]),
      })
      .parse(request.params);

    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, isSuspended: false, storeEnabled: true },
      select: {
        name: true,
        slug: true,
        storeLogoUrl: true,
        storeTermsText: true,
        storePrivacyText: true,
        storeRefundPolicyText: true,
      },
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");

    const titles = { terms: "Terms & Conditions", privacy: "Privacy Policy", refund: "Refund Policy" };
    const bodies = {
      terms: tenant.storeTermsText,
      privacy: tenant.storePrivacyText,
      refund: tenant.storeRefundPolicyText,
    };
    const content = bodies[p.policy];
    if (!content?.trim()) {
      throw new AppError(404, "Not Found", "This policy has not been published yet.");
    }

    return {
      data: {
        slug: tenant.slug,
        storeName: tenant.name,
        storeLogoUrl: tenant.storeLogoUrl,
        policy: p.policy,
        title: titles[p.policy],
        content,
      },
    };
  });

  app.post("/:slug/contact", async (request, reply) => {
    const p = z.object({ slug: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email(),
        phone: z.string().max(40).optional(),
        message: z.string().min(1).max(5000),
      })
      .parse(request.body);

    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, isSuspended: false, storeEnabled: true },
      select: { name: true, storeContactEmail: true, billingEmail: true },
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");

    const to = tenant.storeContactEmail ?? tenant.billingEmail;
    if (!to) {
      throw new AppError(
        503,
        "Unavailable",
        "This store has not configured a contact email yet.",
      );
    }

    const result = await sendPlatformEmail({
      to,
      subject: `[${tenant.name} store] Contact from ${body.name}`,
      text: [
        `New message via ${tenant.name} online store`,
        "",
        `Name: ${body.name}`,
        `Email: ${body.email}`,
        body.phone ? `Phone: ${body.phone}` : null,
        "",
        body.message,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    if (!result.sent) {
      throw new AppError(503, "Unavailable", result.error ?? "Could not send message.");
    }

    void reply.code(201);
    return { data: { sent: true } };
  });

  app.get("/:slug/products", async (request) => {
    const p = z.object({ slug: z.string().min(1) }).parse(request.params);
    const q = z
      .object({
        category: z.string().optional(),
        search: z.string().optional(),
        sort: z.enum(["name", "latest"]).default("name"),
        limit: z.coerce.number().int().min(1).max(100).default(48),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, isSuspended: false, storeEnabled: true },
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");

    const where = {
      tenantId: tenant.id,
      isActive: true,
      showInStore: true,
      ...(q.category ? { category: q.category } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" as const } },
              { sku: { contains: q.search, mode: "insensitive" as const } },
              { description: { contains: q.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [products, total, categories] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: q.sort === "latest" ? { createdAt: "desc" } : { name: "asc" },
        skip: q.offset,
        take: q.limit,
        select: {
          id: true,
          sku: true,
          name: true,
          description: true,
          category: true,
          retailPrice: true,
          imageUrl: true,
          unitOfMeasure: true,
        },
      }),
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: { tenantId: tenant.id, isActive: true, showInStore: true, category: { not: null } },
        distinct: ["category"],
        select: { category: true },
      }),
    ]);

    const ids = products.map((pr) => pr.id);
    const stock = ids.length
      ? await prisma.stockBatch.groupBy({
          by: ["productId"],
          where: { tenantId: tenant.id, productId: { in: ids } },
          _sum: { quantityOnHand: true },
        })
      : [];
    const stockMap = new Map(stock.map((s) => [s.productId, s._sum.quantityOnHand?.toString() ?? "0"]));

    return {
      data: {
        currencyCode: tenant.baseCurrencyCode,
        total,
        categories: categories.map((c) => c.category).filter(Boolean),
        products: products.map((pr) => ({
          ...pr,
          retailPrice: pr.retailPrice?.toString() ?? null,
          inStock: Number(stockMap.get(pr.id) ?? "0") > 0,
          stockOnHand: stockMap.get(pr.id) ?? "0",
        })),
      },
    };
  });

  app.post("/:slug/checkout", async (request, reply) => {
    const p = z.object({ slug: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        customerName: z.string().min(1).max(120),
        customerEmail: z.string().email(),
        lines: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.string(),
            }),
          )
          .min(1),
      })
      .parse(request.body);

    if (!tapConfigured()) {
      throw new AppError(
        503,
        "Payments unavailable",
        "TAP payment gateway is not configured on this platform.",
      );
    }

    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, isSuspended: false, storeEnabled: true },
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");

    const result = await createMarketplaceCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      lines: body.lines,
    });

    void reply.code(201);
    return { data: result };
  });

  app.get("/:slug/checkout/:orderId", async (request) => {
    const p = z
      .object({ slug: z.string().min(1), orderId: z.string().uuid() })
      .parse(request.params);

    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, storeEnabled: true, isSuspended: false },
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");

    try {
      await syncMarketplaceOrderFromTap(p.orderId);
    } catch {
      /* poll best-effort */
    }

    const order = await getMarketplaceOrder(p.orderId, tenant.id);
    return { data: order };
  });

  app.post("/:slug/orders", async (request, reply) => {
    const p = z.object({ slug: z.string().min(1) }).parse(request.params);
    if (tapConfigured()) {
      throw new AppError(
        400,
        "Use checkout",
        "Paid store orders must use POST /v1/store/:slug/checkout with TAP.",
      );
    }
    const body = z
      .object({
        customerName: z.string().min(1).max(120),
        customerEmail: z.string().email(),
        lines: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.string(),
            }),
          )
          .min(1),
      })
      .parse(request.body);

    const tenant = await prisma.tenant.findFirst({
      where: { slug: p.slug, isSuspended: false, storeEnabled: true },
    });
    if (!tenant) throw new AppError(404, "Not Found", "Store not found.");

    const cashier = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "OWNER", isActive: true },
    });
    if (!cashier) throw new AppError(503, "Unavailable", "Store checkout is not configured.");

    const productIds = body.lines.map((l) => l.productId);
    const products = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        id: { in: productIds },
        isActive: true,
        showInStore: true,
      },
    });
    if (products.length !== body.lines.length) {
      throw new AppError(400, "Invalid products", "One or more products are unavailable.");
    }
    const priceMap = new Map(products.map((pr) => [pr.id, pr]));

    let subtotal = 0;
    const saleLines = body.lines.map((l) => {
      const pr = priceMap.get(l.productId)!;
      const unitPrice = Number(pr.retailPrice?.toString() ?? "0");
      if (unitPrice <= 0) {
        throw new AppError(400, "No price", `Product ${pr.sku} has no retail price.`);
      }
      const qty = Number(l.quantity);
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;
      return {
        productId: pr.id,
        quantity: l.quantity,
        unitPrice: unitPrice.toFixed(4),
        lineTotal: lineTotal.toFixed(4),
        taxRatePercent: "0",
        currencyCode: tenant.baseCurrencyCode,
      };
    });

    const receiptNumber = `WEB-${Date.now().toString(36).toUpperCase()}`;
    const sale = await prisma.sale.create({
      data: {
        tenantId: tenant.id,
        receiptNumber,
        channel: "ONLINE",
        status: "COMPLETED",
        subtotalAmount: subtotal.toFixed(4),
        taxAmount: "0",
        totalAmount: subtotal.toFixed(4),
        currencyCode: tenant.baseCurrencyCode,
        cashierUserId: cashier.id,
        lines: { create: saleLines },
        payments: {
          create: [
            {
              method: "OTHER",
              amount: subtotal.toFixed(4),
              currencyCode: tenant.baseCurrencyCode,
              reference: `online:${body.customerEmail}`,
            },
          ],
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: cashier.id,
        action: "ONLINE_ORDER",
        entityName: "Sale",
        entityId: sale.id,
        newValues: {
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          receiptNumber,
          total: subtotal.toFixed(4),
        },
      },
    });

    void reply.code(201);
    return {
      data: {
        orderId: sale.id,
        receiptNumber,
        totalAmount: subtotal.toFixed(4),
        currencyCode: tenant.baseCurrencyCode,
      },
    };
  });
};
