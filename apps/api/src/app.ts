import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { AppError, problemFromError, sendProblem } from "./lib/problem.js";
import { attachTenantContext } from "./middleware/tenant.js";
import { subscriptionAccessHook } from "./middleware/subscription-gate.js";
import { attachPlatformAdmin } from "./middleware/platform-admin.js";
import { registerTenantRoutes } from "./routes/index.js";
import { publicRoutes } from "./routes/public.js";
import { adminRoutes } from "./routes/admin.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  await app.register(publicRoutes, { prefix: "/v1/public" });

  await app.register(
    async (v1) => {
      v1.addHook("preHandler", async (request, reply) => {
        if (request.method === "OPTIONS") return;
        try {
          request.ctx = await attachTenantContext(request);
        } catch (e) {
          if (e instanceof AppError) {
            sendProblem(reply, {
              type: e.type ?? "about:blank",
              title: e.title,
              status: e.status,
              detail: e.detail,
              instance: request.id,
            });
            return;
          }
          throw e;
        }
      });

      v1.addHook("preHandler", subscriptionAccessHook);

      await registerTenantRoutes(v1);
    },
    { prefix: "/v1" },
  );

  await app.register(
    async (adminScope) => {
      adminScope.addHook("preHandler", async (request, reply) => {
        if (request.method === "OPTIONS") return;
        try {
          await attachPlatformAdmin(request);
        } catch (e) {
          if (e instanceof AppError) {
            sendProblem(reply, {
              type: e.type ?? "about:blank",
              title: e.title,
              status: e.status,
              detail: e.detail,
              instance: request.id,
            });
            return;
          }
          throw e;
        }
      });
      await adminScope.register(adminRoutes);
    },
    { prefix: "/v1/admin" },
  );

  app.setErrorHandler((err, request, reply) => {
    if (reply.sent) return;
    if (err instanceof AppError) {
      sendProblem(reply, {
        type: err.type ?? "about:blank",
        title: err.title,
        status: err.status,
        detail: err.detail,
        instance: request.id,
        errors: err.errors,
      });
      return;
    }
    const p = problemFromError(err, request.id);
    sendProblem(reply, p);
  });

  return app;
}
