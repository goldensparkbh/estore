import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { requireCtx } from "../middleware/tenant.js";
import { clockIn, clockOut, decideLeaveRequest, runMonthlyPayroll } from "../services/hr.js";

const clockInBody = z.object({
  employeeId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  clockInIp: z.string().optional(),
  clockInLat: z.string().optional(),
  clockInLng: z.string().optional(),
  geofenceRadiusM: z.number().int().positive().optional(),
});

const clockOutBody = z.object({
  employeeId: z.string().uuid(),
  overtimeMinutes: z.number().int().min(0).optional(),
});

const leaveDecision = z.object({
  leaveRequestId: z.string().uuid(),
  approverEmployeeId: z.string().uuid(),
  status: z.enum(["APPROVED", "REJECTED"]),
  balanceAfter: z.string().optional(),
});

const payrollRun = z.object({
  processedByLabel: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currencyCode: z.string().length(3),
  bonusRatePercent: z.string().optional(),
  taxRatePercent: z.string().optional(),
  insuranceRatePercent: z.string().optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const iss of parsed.error.issues) {
      const k = iss.path.join(".") || "body";
      errors[k] ??= [];
      errors[k].push(iss.message);
    }
    throw new AppError(400, "Validation Error", "Request body failed validation.", undefined, errors);
  }
  return parsed.data;
}

export const hrRoutes: FastifyPluginAsync = async (app) => {
  app.get("/employees", async (request) => {
    const { tenantId } = requireCtx(request);
    const rows = await prisma.employee.findMany({
      where: { tenantId },
      orderBy: { fullName: "asc" },
      include: { department: true },
    });
    const data = rows.map((e) => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      email: e.email,
      fullName: e.fullName,
      jobTitle: e.jobTitle,
      hireDate: e.hireDate.toISOString(),
      employmentType: e.employmentType,
      baseSalary: e.baseSalary.toString(),
      salaryCurrency: e.salaryCurrency,
      isActive: e.isActive,
      department: e.department
        ? { id: e.department.id, name: e.department.name, code: e.department.code }
        : null,
    }));
    return { data };
  });

  app.post("/employees", async (request, reply) => {
    const schema = z.object({
      employeeNumber: z.string().min(1),
      email: z.string().email(),
      fullName: z.string().min(1),
      departmentId: z.string().uuid().optional(),
      jobTitle: z.string().optional(),
      hireDate: z.string().datetime(),
      employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).optional(),
      baseSalary: z.string(),
      salaryCurrency: z.string().length(3),
    });
    const body = parseBody(schema, request.body);
    const { tenantId } = requireCtx(request);
    if (body.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: body.departmentId, tenantId },
      });
      if (!dept) {
        throw new AppError(404, "Not Found", "Department not found for tenant.");
      }
    }
    const created = await prisma.employee.create({
      data: {
        tenantId,
        employeeNumber: body.employeeNumber,
        email: body.email,
        fullName: body.fullName,
        departmentId: body.departmentId,
        jobTitle: body.jobTitle,
        hireDate: new Date(body.hireDate),
        employmentType: body.employmentType ?? "FULL_TIME",
        baseSalary: body.baseSalary,
        salaryCurrency: body.salaryCurrency,
      },
    });
    void reply.code(201);
    return { data: created };
  });

  app.post("/attendance/clock-in", async (request) => {
    const body = parseBody(clockInBody, request.body);
    const ctx = requireCtx(request);
    return {
      data: await clockIn({
        tenantId: ctx.tenantId,
        employeeId: body.employeeId,
        shiftId: body.shiftId,
        clockInIp: body.clockInIp,
        clockInLat: body.clockInLat,
        clockInLng: body.clockInLng,
        geofenceRadiusM: body.geofenceRadiusM,
        userId: ctx.userId,
        ip: request.ip,
      }),
    };
  });

  app.post("/attendance/clock-out", async (request) => {
    const body = parseBody(clockOutBody, request.body);
    const ctx = requireCtx(request);
    return {
      data: await clockOut({
        tenantId: ctx.tenantId,
        employeeId: body.employeeId,
        userId: ctx.userId,
        overtimeMinutes: body.overtimeMinutes,
        ip: request.ip,
      }),
    };
  });

  app.post("/leave/decision", async (request) => {
    const body = parseBody(leaveDecision, request.body);
    const ctx = requireCtx(request);
    await decideLeaveRequest({
      tenantId: ctx.tenantId,
      leaveRequestId: body.leaveRequestId,
      approverEmployeeId: body.approverEmployeeId,
      status: body.status,
      balanceAfter: body.balanceAfter,
      userId: ctx.userId,
      ip: request.ip,
    });
    return { data: { ok: true } };
  });

  app.post("/payroll/run", async (request) => {
    const body = parseBody(payrollRun, request.body);
    const ctx = requireCtx(request);
    const result = await runMonthlyPayroll({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      processedByLabel: body.processedByLabel,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      currencyCode: body.currencyCode,
      bonusRatePercent: body.bonusRatePercent,
      taxRatePercent: body.taxRatePercent,
      insuranceRatePercent: body.insuranceRatePercent,
      ip: request.ip,
    });
    return { data: result };
  });
};
