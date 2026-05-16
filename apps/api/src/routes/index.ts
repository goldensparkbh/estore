import type { FastifyInstance } from "fastify";
import { billingRoutes } from "./billing.js";
import { inventoryRoutes } from "./inventory.js";
import { hrRoutes } from "./hr.js";
import { posRoutes } from "./pos.js";
import { referenceRoutes } from "./reference.js";

export async function registerTenantRoutes(app: FastifyInstance): Promise<void> {
  await app.register(billingRoutes, { prefix: "/billing" });
  await app.register(inventoryRoutes, { prefix: "/inventory" });
  await app.register(posRoutes, { prefix: "/pos" });
  await app.register(hrRoutes, { prefix: "/hr" });
  await app.register(referenceRoutes, { prefix: "/reference" });
}
