import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import { AppError } from "../lib/problem.js";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma.js";
import { tenantUserRoutes } from "./tenant-users.js";

async function buildTestApp() {
  const app = Fastify();
  app.decorateRequest("ctx", undefined);
  app.addHook("preHandler", async (request) => {
    request.ctx = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000010",
    };
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      void reply.code(err.status).send({ title: err.title, detail: err.detail });
      return;
    }
    void reply.code(500).send({ error: String(err) });
  });
  await app.register(tenantUserRoutes, { prefix: "/team" });
  return app;
}

describe("tenant-users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists workspace users", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "u1",
        email: "a@test.com",
        displayName: "Admin",
        role: "ADMIN",
        isActive: true,
        createdAt: new Date("2024-01-01"),
      },
    ] as never);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/team/" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it("rejects user creation for non-admin", async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      role: "MEMBER",
    } as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/team/",
      payload: {
        email: "new@test.com",
        password: "longpassword1",
        displayName: "New User",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("creates user when caller is admin", async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      role: "ADMIN",
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000030",
      email: "new@test.com",
      displayName: "New User",
      role: "MEMBER",
      isActive: true,
      createdAt: new Date(),
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/team/",
      payload: {
        email: "new@test.com",
        password: "longpassword1",
        displayName: "New User",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_CREATED" }) }),
    );
  });

  it("prevents deactivating the only owner", async () => {
    const ownerId = "00000000-0000-4000-8000-000000000020";
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      role: "OWNER",
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: ownerId,
      role: "OWNER",
      tenantId: "00000000-0000-4000-8000-000000000001",
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0);

    const app = await buildTestApp();
    const res = await app.inject({ method: "DELETE", url: `/team/${ownerId}` });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).detail).toMatch(/owner/i);
  });

  it("hashes password on create", async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      role: "ADMIN",
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockImplementation((args) =>
      Promise.resolve({
        id: "00000000-0000-4000-8000-000000000031",
        email: args.data.email as string,
        displayName: args.data.displayName as string,
        role: args.data.role as string,
        isActive: true,
        createdAt: new Date(),
      }) as ReturnType<typeof prisma.user.create>,
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await buildTestApp();
    await app.inject({
      method: "POST",
      url: "/team/",
      payload: {
        email: "hash@test.com",
        password: "longpassword1",
        displayName: "Hashed",
      },
    });

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0];
    const hash = createCall.data.passwordHash as string;
    expect(await bcrypt.compare("longpassword1", hash)).toBe(true);
  });
});
