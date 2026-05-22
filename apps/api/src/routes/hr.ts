import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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
      departmentId: z.string().uuid().nullable().optional(),
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
        departmentId: body.departmentId ?? undefined,
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

  app.patch("/employees/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = parseBody(
      z.object({
        employeeNumber: z.string().min(1).optional(),
        email: z.string().email().optional(),
        fullName: z.string().min(1).optional(),
        departmentId: z.string().uuid().nullable().optional(),
        jobTitle: z.string().nullable().optional(),
        employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).optional(),
        baseSalary: z.string().optional(),
        salaryCurrency: z.string().length(3).optional(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    const existing = await prisma.employee.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Employee not found.");
    const updated = await prisma.employee.update({
      where: { id: existing.id },
      data: {
        employeeNumber: body.employeeNumber,
        email: body.email,
        fullName: body.fullName,
        departmentId: body.departmentId === null ? null : body.departmentId,
        jobTitle: body.jobTitle === null ? null : body.jobTitle,
        employmentType: body.employmentType,
        baseSalary: body.baseSalary,
        salaryCurrency: body.salaryCurrency,
        isActive: body.isActive,
      },
    });
    return { data: updated };
  });

  app.delete("/employees/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.employee.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new AppError(404, "Not found", "Employee not found.");
    const updated = await prisma.employee.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return { data: { id: updated.id, deactivated: true } };
  });

  app.get("/departments", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.department.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { employees: true } } },
    });
    return {
      data: rows.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        parentId: d.parentId,
        employeeCount: d._count.employees,
      })),
    };
  });

  app.post("/departments", async (request, reply) => {
    const ctx = requireCtx(request);
    const body = parseBody(
      z.object({
        name: z.string().min(1).max(120),
        code: z.string().min(1).max(40),
        parentId: z.string().uuid().nullable().optional(),
      }),
      request.body,
    );
    const created = await prisma.department.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        code: body.code,
        parentId: body.parentId ?? undefined,
      },
    });
    void reply.code(201);
    return { data: created };
  });

  app.delete("/departments/:id", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.department.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
      include: { _count: { select: { employees: true } } },
    });
    if (!existing) throw new AppError(404, "Not found", "Department not found.");
    if (existing._count.employees > 0) {
      throw new AppError(
        409,
        "Conflict",
        "Department still has employees. Move them first.",
      );
    }
    await prisma.department.delete({ where: { id: existing.id } });
    return { data: { id: existing.id, deleted: true } };
  });

  app.get("/attendance/recent", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.attendanceRecord.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { clockInAt: "desc" },
      take: 100,
      include: { employee: { select: { id: true, fullName: true, employeeNumber: true } } },
    });
    return {
      data: rows.map((a) => ({
        id: a.id,
        clockInAt: a.clockInAt.toISOString(),
        clockOutAt: a.clockOutAt?.toISOString() ?? null,
        overtimeMinutes: a.overtimeMinutes,
        notes: a.notes,
        employee: a.employee,
      })),
    };
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

  app.get("/payroll/runs", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.payrollRun.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { runAt: "desc" },
      take: 50,
      include: { _count: { select: { payslips: true } } },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        periodStart: r.periodStart.toISOString(),
        periodEnd: r.periodEnd.toISOString(),
        runAt: r.runAt.toISOString(),
        processedBy: r.processedBy,
        status: r.status,
        currencyCode: r.currencyCode,
        payslipCount: r._count.payslips,
      })),
    };
  });

  app.get("/payroll/runs/:id/payslips", async (request) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const run = await prisma.payrollRun.findFirst({
      where: { id: p.id, tenantId: ctx.tenantId },
    });
    if (!run) throw new AppError(404, "Not found", "Payroll run not found.");
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      include: { employee: { select: { fullName: true, employeeNumber: true } } },
      orderBy: { issuedAt: "asc" },
    });
    return {
      data: payslips.map((s) => ({
        id: s.id,
        employee: s.employee,
        grossPay: s.grossPay.toString(),
        bonusPay: s.bonusPay.toString(),
        taxDeduction: s.taxDeduction.toString(),
        insuranceAmt: s.insuranceAmt.toString(),
        netPay: s.netPay.toString(),
        currencyCode: s.currencyCode,
        hasPdf: Boolean(s.pdfStorageKey),
        issuedAt: s.issuedAt.toISOString(),
      })),
    };
  });

  app.get("/payslips/:id/pdf", async (request, reply) => {
    const ctx = requireCtx(request);
    const p = z.object({ id: z.string().uuid() }).parse(request.params);
    const payslip = await prisma.payslip.findFirst({
      where: { id: p.id, payrollRun: { tenantId: ctx.tenantId } },
    });
    if (!payslip || !payslip.pdfStorageKey) {
      throw new AppError(404, "Not found", "Payslip PDF not found.");
    }
    try {
      await stat(payslip.pdfStorageKey);
    } catch {
      throw new AppError(410, "Gone", "Payslip file no longer exists on disk.");
    }
    void reply.header("content-type", "application/pdf");
    void reply.header(
      "content-disposition",
      `inline; filename="payslip-${payslip.id}.pdf"`,
    );
    return reply.send(createReadStream(payslip.pdfStorageKey));
  });

  app.get("/leave/policies", async (request) => {
    const ctx = requireCtx(request);
    const rows = await prisma.leavePolicy.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
    });
    return {
      data: rows.map((p) => ({
        id: p.id,
        name: p.name,
        accrualHoursPerMonth: p.accrualHoursPerMonth.toString(),
        maxCarryoverHours: p.maxCarryoverHours.toString(),
        approvalTier: p.approvalTier,
      })),
    };
  });

  app.post("/leave/policies", async (request, reply) => {
    const ctx = requireCtx(request);
    const body = parseBody(
      z.object({
        name: z.string().min(1).max(120),
        accrualHoursPerMonth: z.string(),
        maxCarryoverHours: z.string(),
        approvalTier: z.number().int().min(1).max(5).optional(),
      }),
      request.body,
    );
    const created = await prisma.leavePolicy.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        accrualHoursPerMonth: body.accrualHoursPerMonth,
        maxCarryoverHours: body.maxCarryoverHours,
        approvalTier: body.approvalTier ?? 1,
      },
    });
    void reply.code(201);
    return { data: created };
  });

  app.get("/leave/requests", async (request) => {
    const ctx = requireCtx(request);
    const q = z
      .object({
        status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
      })
      .parse(request.query);
    const rows = await prisma.leaveRequest.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { startAt: "desc" },
      take: 200,
      include: {
        employee: { select: { id: true, fullName: true, employeeNumber: true } },
        approver: { select: { id: true, fullName: true } },
        policy: { select: { id: true, name: true } },
      },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        status: r.status,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        hours: r.hours.toString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        balanceAfter: r.balanceAfter?.toString() ?? null,
        employee: r.employee,
        approver: r.approver,
        policy: r.policy,
      })),
    };
  });

  app.post("/leave/requests", async (request, reply) => {
    const ctx = requireCtx(request);
    const body = parseBody(
      z.object({
        employeeId: z.string().uuid(),
        policyId: z.string().uuid(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
        hours: z.string(),
      }),
      request.body,
    );
    const [employee, policy] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: body.employeeId, tenantId: ctx.tenantId },
      }),
      prisma.leavePolicy.findFirst({
        where: { id: body.policyId, tenantId: ctx.tenantId },
      }),
    ]);
    if (!employee) throw new AppError(404, "Not found", "Employee not found.");
    if (!policy) throw new AppError(404, "Not found", "Policy not found.");
    const created = await prisma.leaveRequest.create({
      data: {
        tenantId: ctx.tenantId,
        employeeId: body.employeeId,
        policyId: body.policyId,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        hours: body.hours,
        status: "PENDING",
      },
    });
    void reply.code(201);
    return { data: created };
  });
};
