import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/problem.js";

const MANAGER_TITLE = /manager|head|lead|supervisor|director/i;

/**
 * Resolve the employee who should approve a leave request based on policy tier.
 * Tier 1: department manager in same department
 * Tier 2: workspace ADMIN user (matched by employee email)
 * Tier 3: workspace OWNER user (matched by employee email)
 */
export async function resolveLeaveApprover(input: {
  tenantId: string;
  employeeId: string;
  approvalTier: number;
}): Promise<string | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, tenantId: input.tenantId, isActive: true },
  });
  if (!employee) return null;

  if (input.approvalTier <= 1 && employee.departmentId) {
    const manager = await prisma.employee.findFirst({
      where: {
        tenantId: input.tenantId,
        departmentId: employee.departmentId,
        isActive: true,
        id: { not: employee.id },
        OR: [{ jobTitle: { contains: "manager", mode: "insensitive" } }],
      },
    });
    if (manager) return manager.id;

    const deptManagers = await prisma.employee.findMany({
      where: {
        tenantId: input.tenantId,
        departmentId: employee.departmentId,
        isActive: true,
        id: { not: employee.id },
      },
    });
    const byTitle = deptManagers.find((e) => e.jobTitle && MANAGER_TITLE.test(e.jobTitle));
    if (byTitle) return byTitle.id;
  }

  const targetRole = input.approvalTier >= 3 ? "OWNER" : "ADMIN";
  const user = await prisma.user.findFirst({
    where: { tenantId: input.tenantId, role: targetRole, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    if (targetRole === "ADMIN") {
      const owner = await prisma.user.findFirst({
        where: { tenantId: input.tenantId, role: "OWNER", isActive: true },
      });
      if (owner) {
        const emp = await prisma.employee.findFirst({
          where: { tenantId: input.tenantId, email: owner.email, isActive: true },
        });
        return emp?.id ?? null;
      }
    }
    return null;
  }

  const approverEmp = await prisma.employee.findFirst({
    where: { tenantId: input.tenantId, email: user.email, isActive: true },
  });
  return approverEmp?.id ?? null;
}

export async function assertCanDecideLeave(input: {
  tenantId: string;
  userId: string;
  leaveRequestId: string;
}): Promise<{ approverEmployeeId: string }> {
  const req = await prisma.leaveRequest.findFirst({
    where: { id: input.leaveRequestId, tenantId: input.tenantId },
    include: { policy: true, employee: true },
  });
  if (!req) throw new AppError(404, "Not Found", "Leave request not found.");
  if (req.status !== "PENDING") {
    throw new AppError(409, "Invalid State", "Leave request is not pending.");
  }

  const me = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (me.role === "OWNER" || me.role === "ADMIN") {
    const emp = await prisma.employee.findFirst({
      where: { tenantId: input.tenantId, email: me.email, isActive: true },
    });
    if (emp) return { approverEmployeeId: emp.id };
    if (req.assignedApproverId) return { approverEmployeeId: req.assignedApproverId };
    throw new AppError(403, "Forbidden", "Link your user email to an employee record to approve leave.");
  }

  const myEmployee = await prisma.employee.findFirst({
    where: { tenantId: input.tenantId, email: me.email, isActive: true },
  });
  if (!myEmployee) {
    throw new AppError(403, "Forbidden", "Only assigned approvers can decide leave requests.");
  }

  if (req.assignedApproverId && req.assignedApproverId !== myEmployee.id) {
    throw new AppError(403, "Forbidden", "You are not the assigned approver for this request.");
  }

  if (!req.assignedApproverId) {
    const resolved = await resolveLeaveApprover({
      tenantId: input.tenantId,
      employeeId: req.employeeId,
      approvalTier: req.policy.approvalTier,
    });
    if (resolved !== myEmployee.id) {
      throw new AppError(403, "Forbidden", "You are not authorized to approve this leave request.");
    }
  }

  return { approverEmployeeId: myEmployee.id };
}
