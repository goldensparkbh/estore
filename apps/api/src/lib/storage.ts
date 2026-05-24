import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function productImageDir(tenantId: string): string {
  return path.join(process.cwd(), "storage", "products", tenantId);
}

export function productImagePath(tenantId: string, productId: string, ext: string): string {
  return path.join(productImageDir(tenantId), `${productId}.${ext}`);
}

export function productImagePublicUrl(productId: string): string {
  return `/v1/files/products/${productId}`;
}

export async function saveProductImage(
  tenantId: string,
  productId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const ext = IMAGE_MIME[mimeType];
  if (!ext) throw new Error("Unsupported image type");
  const dir = productImageDir(tenantId);
  await mkdir(dir, { recursive: true });
  for (const oldExt of Object.values(IMAGE_MIME)) {
    try {
      await unlink(path.join(dir, `${productId}.${oldExt}`));
    } catch {
      /* ignore */
    }
  }
  const filePath = productImagePath(tenantId, productId, ext);
  await writeFile(filePath, buffer);
  return productImagePublicUrl(productId);
}

export function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], "base64") };
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
