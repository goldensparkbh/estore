import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { productImageDir } from "../lib/storage.js";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export const filesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/products/:productId", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { tenantId: true },
    });
    if (!product) throw new AppError(404, "Not found", "Product not found.");

    const dir = productImageDir(product.tenantId);
    for (const ext of Object.keys(EXT_MIME)) {
      const filePath = path.join(dir, `${productId}.${ext}`);
      try {
        await stat(filePath);
        void reply.header("content-type", EXT_MIME[ext]);
        void reply.header("cache-control", "public, max-age=86400");
        return reply.send(createReadStream(filePath));
      } catch {
        /* try next ext */
      }
    }
    throw new AppError(404, "Not found", "Image not found.");
  });
};
