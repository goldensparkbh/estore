import Decimal from "decimal.js";
import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LeaveStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";
import { writeAuditLog } from "./audit.js";

function toDec(n: string | number): Decimal {
  return new Decimal(n);
}

export interface ClockInInput {
  tenantId: string;
  employeeId: string;
  shiftId?: string;
  clockInIp?: string;
  clockInLat?: string;
  clockInLng?: string;
  geofenceRadiusM?: number;
  userId: string;
  ip?: string | null;
}

export async function clockIn(input: ClockInInput): Promise<{ recordId: string }> {
  const emp = await prisma.employee.findFirst({
    where: { id: input.employeeId, tenantId: input.tenantId, isActive: true },
  });
  if (!emp) {
    throw new AppError(404, "Not Found", "Employee not found.");
  }

  const open = await prisma.attendanceRecord.findFirst({
    where: { tenantId: input.tenantId, employeeId: input.employeeId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (open) {
    throw new AppError(409, "Already Clocked In", "Close the open attendance first.");
  }

  const rec = await prisma.attendanceRecord.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      clockInAt: new Date(),
      clockInIp: input.clockInIp,
      clockInLat: input.clockInLat,
      clockInLng: input.clockInLng,
      geofenceRadiusM: input.geofenceRadiusM,
    },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "HR_CLOCK_IN",
    entityName: "AttendanceRecord",
    entityId: rec.id,
    newValues: { employeeId: input.employeeId },
    ipAddress: input.ip,
  });

  return { recordId: rec.id };
}

export interface ClockOutInput {
  tenantId: string;
  employeeId: string;
  userId: string;
  overtimeMinutes?: number;
  ip?: string | null;
}

export async function clockOut(input: ClockOutInput): Promise<{ recordId: string }> {
  const open = await prisma.attendanceRecord.findFirst({
    where: { tenantId: input.tenantId, employeeId: input.employeeId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) {
    throw new AppError(409, "Not Clocked In", "No open attendance record.");
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: {
      clockOutAt: new Date(),
      overtimeMinutes: input.overtimeMinutes ?? 0,
    },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "HR_CLOCK_OUT",
    entityName: "AttendanceRecord",
    entityId: updated.id,
    newValues: { clockOutAt: updated.clockOutAt?.toISOString() },
    ipAddress: input.ip,
  });

  return { recordId: updated.id };
}

export interface LeaveDecisionInput {
  tenantId: string;
  leaveRequestId: string;
  approverEmployeeId: string;
  status: Extract<LeaveStatus, "APPROVED" | "REJECTED">;
  balanceAfter?: string;
  userId: string;
  ip?: string | null;
}

export async function decideLeaveRequest(input: LeaveDecisionInput): Promise<void> {
  const req = await prisma.leaveRequest.findFirst({
    where: { id: input.leaveRequestId, tenantId: input.tenantId },
  });
  if (!req) {
    throw new AppError(404, "Not Found", "Leave request not found.");
  }
  if (req.status !== "PENDING") {
    throw new AppError(409, "Invalid State", "Leave request is not pending.");
  }

  await prisma.leaveRequest.update({
    where: { id: req.id },
    data: {
      status: input.status,
      approverId: input.approverEmployeeId,
      decidedAt: new Date(),
      balanceAfter: input.balanceAfter ?? undefined,
    },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "LEAVE_DECISION",
    entityName: "LeaveRequest",
    entityId: req.id,
    newValues: { status: input.status, approverId: input.approverEmployeeId },
    ipAddress: input.ip,
  });
}

export interface PayrollComponentInput {
  code: string;
  label: string;
  amount: string;
}

export interface RunPayrollInput {
  tenantId: string;
  userId: string;
  processedByLabel: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  bonusRatePercent?: string;
  taxRatePercent?: string;
  insuranceRatePercent?: string;
  ip?: string | null;
}

export async function runMonthlyPayroll(
  input: RunPayrollInput,
): Promise<{ payrollRunId: string; payslipCount: number }> {
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  const bonusRate = toDec(input.bonusRatePercent ?? "0").div(100);
  const taxRate = toDec(input.taxRatePercent ?? "0").div(100);
  const insRate = toDec(input.insuranceRatePercent ?? "0").div(100);

  const employees = await prisma.employee.findMany({
    where: { tenantId: input.tenantId, isActive: true },
  });
  if (employees.length === 0) {
    throw new AppError(400, "No Employees", "Nothing to process.");
  }

  const payslipRows: Array<{
    payslipId: string;
    emp: (typeof employees)[0];
    gross: Decimal;
    bonus: Decimal;
    tax: Decimal;
    insurance: Decimal;
    net: Decimal;
  }> = [];

  const payslipResults = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        tenantId: input.tenantId,
        periodStart,
        periodEnd,
        processedBy: input.processedByLabel,
        currencyCode: input.currencyCode,
      },
    });

    let count = 0;
    for (const emp of employees) {
      const base = toDec(emp.baseSalary.toString());
      const bonus = base.mul(bonusRate);
      const gross = base.plus(bonus);
      const tax = gross.mul(taxRate);
      const insurance = gross.mul(insRate);
      const net = gross.minus(tax).minus(insurance);

      const payslip = await tx.payslip.create({
        data: {
          payrollRunId: run.id,
          employeeId: emp.id,
          grossPay: gross.toFixed(4),
          bonusPay: bonus.toFixed(4),
          taxDeduction: tax.toFixed(4),
          insuranceAmt: insurance.toFixed(4),
          netPay: net.toFixed(4),
          currencyCode: input.currencyCode,
          components: {
            create: [
              {
                code: "BASE",
                label: "Basic pay",
                amount: base.toFixed(4),
                currencyCode: input.currencyCode,
              },
              {
                code: "BONUS",
                label: "Bonus",
                amount: bonus.toFixed(4),
                currencyCode: input.currencyCode,
              },
            ],
          },
        },
      });

      payslipRows.push({ payslipId: payslip.id, emp, gross, bonus, tax, insurance, net });
      count += 1;
    }

    return { payrollRunId: run.id, payslipCount: count };
  });

  const dir = path.join(process.cwd(), "storage", "payslips", payslipResults.payrollRunId);
  await mkdir(dir, { recursive: true });
  for (const row of payslipRows) {
    const pdfPath = path.join(dir, `${row.payslipId}.pdf`);
    const pdfBuffer = await renderPayslipPdf({
      employeeName: row.emp.fullName,
      employeeNumber: row.emp.employeeNumber,
      periodStart,
      periodEnd,
      gross: row.gross,
      bonus: row.bonus,
      tax: row.tax,
      insurance: row.insurance,
      net: row.net,
      currency: input.currencyCode,
    });
    await writeFile(pdfPath, pdfBuffer);
    const sha = createHash("sha256").update(pdfBuffer).digest("hex");
    await prisma.payslip.update({
      where: { id: row.payslipId },
      data: { pdfStorageKey: pdfPath, pdfSha256: sha },
    });
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "PAYROLL_RUN",
    entityName: "PayrollRun",
    entityId: payslipResults.payrollRunId,
    newValues: { payslipCount: payslipResults.payslipCount },
    ipAddress: input.ip,
  });

  return payslipResults;
}

async function renderPayslipPdf(params: {
  employeeName: string;
  employeeNumber: string;
  periodStart: Date;
  periodEnd: Date;
  gross: Decimal;
  bonus: Decimal;
  tax: Decimal;
  insurance: Decimal;
  net: Decimal;
  currency: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Payslip", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`Employee: ${params.employeeName} (${params.employeeNumber})`);
    doc.text(
      `Period: ${params.periodStart.toISOString().slice(0, 10)} – ${params.periodEnd.toISOString().slice(0, 10)}`,
    );
    doc.moveDown();
    doc.text(`Gross: ${params.gross.toFixed(2)} ${params.currency}`);
    doc.text(`Bonus: ${params.bonus.toFixed(2)} ${params.currency}`);
    doc.text(`Tax: ${params.tax.toFixed(2)} ${params.currency}`);
    doc.text(`Insurance: ${params.insurance.toFixed(2)} ${params.currency}`);
    doc.moveDown();
    doc.fontSize(12).text(`Net pay: ${params.net.toFixed(2)} ${params.currency}`, {
      underline: true,
    });
    doc.text("This document contains sensitive payroll information. Store securely.", 50, 700, {
      width: 500,
    });
    doc.end();
  });
}
