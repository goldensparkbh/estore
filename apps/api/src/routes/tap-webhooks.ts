import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { applyTapChargeUpdate } from "../services/marketplace.js";
import { tapRetrieveCharge, tapWebhookSecret } from "../services/tap.js";

interface TapWebhookBody {
  id?: string;
  status?: string;
  metadata?: { orderId?: string };
  reference?: { order?: string };
}

export const tapWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post("/tap", async (request, reply) => {
    const body = request.body as TapWebhookBody;
    const chargeId = body.id;
    if (!chargeId) {
      return reply.code(400).send({ error: "missing-charge-id" });
    }

    const secret = tapWebhookSecret();
    if (secret) {
      const header =
        request.headers["hashstring"] ??
        request.headers["x-tap-signature"] ??
        request.headers["tap-signature"];
      if (!header || String(header) !== secret) {
        request.log.warn("TAP webhook signature mismatch");
        return reply.code(401).send({ error: "invalid-signature" });
      }
    }

    let orderId =
      body.metadata?.orderId ?? body.reference?.order ?? null;

    if (!orderId) {
      const existing = await prisma.marketplaceOrder.findFirst({
        where: { tapChargeId: chargeId },
        select: { id: true },
      });
      orderId = existing?.id ?? null;
    }

    if (!orderId) {
      request.log.warn({ chargeId }, "TAP webhook: order not found");
      return reply.send({ received: true, matched: false });
    }

    try {
      const charge = await tapRetrieveCharge(chargeId);
      await applyTapChargeUpdate(orderId, charge, "webhook");
    } catch (err) {
      request.log.error({ err, chargeId, orderId }, "TAP webhook handler failed");
      return reply.code(500).send({ error: "handler-failed" });
    }

    return reply.send({ received: true, matched: true });
  });
};
