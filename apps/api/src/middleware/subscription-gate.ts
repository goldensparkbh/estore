import type { FastifyRequest, FastifyReply } from "fastify";
import { assertTenantCanAccessPath } from "../services/billing.js";

export async function subscriptionAccessHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (reply.sent) return;
  if (request.method === "OPTIONS") return;
  const raw = request.url.split("?")[0] ?? "";
  const ctx = request.ctx;
  if (!ctx) return;
  await assertTenantCanAccessPath(ctx.tenantId, raw);
}
