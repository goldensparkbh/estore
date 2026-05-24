import type { FastifyInstance } from "fastify";
import { billingRoutes } from "./billing.js";
import { inventoryRoutes } from "./inventory.js";
import { hrRoutes } from "./hr.js";
import { posRoutes } from "./pos.js";
import { referenceRoutes } from "./reference.js";
import { accountRoutes } from "./account.js";
import { tenantUserRoutes } from "./tenant-users.js";
import { analyticsRoutes } from "./analytics.js";
import { auditRoutes } from "./audit.js";
import { marketplaceRoutes } from "./marketplace.js";

export async function registerTenantRoutes(app: FastifyInstance): Promise<void> {
  await app.register(accountRoutes, { prefix: "/account" });
  await app.register(tenantUserRoutes, { prefix: "/team" });
  await app.register(analyticsRoutes, { prefix: "/analytics" });
  await app.register(auditRoutes, { prefix: "/audit-logs" });
  await app.register(marketplaceRoutes, { prefix: "/marketplace" });
  await app.register(billingRoutes, { prefix: "/billing" });
  await app.register(inventoryRoutes, { prefix: "/inventory" });
  await app.register(posRoutes, { prefix: "/pos" });
  await app.register(hrRoutes, { prefix: "/hr" });
  await app.register(referenceRoutes, { prefix: "/reference" });
}
