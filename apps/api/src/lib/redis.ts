import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) {
    client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  }
  return client;
}

export async function rateLimitKey(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const r = getRedis();
  if (!r) {
    return { allowed: true, remaining: limit };
  }
  const k = `rl:${key}`;
  try {
    const count = await r.incr(k);
    if (count === 1) {
      await r.expire(k, windowSeconds);
    }
    const allowed = count <= limit;
    return { allowed, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}
