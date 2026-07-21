import "server-only";

import { db } from "@/lib/db";
import type { HrEmployeeStatus } from "@prisma/client";

export class NotFoundError extends Error {}

async function requireEmployee(organizationId: string, employeeId: string) {
  const employee = await db.hrEmployee.findFirst({ where: { id: employeeId, organizationId } });
  if (!employee) throw new NotFoundError("Employee not found.");
}

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 */

// --- Employees ---

export function listEmployees(organizationId: string) {
  return db.hrEmployee.findMany({
    where: { organizationId },
    include: { manager: true, user: true },
    orderBy: { fullName: "asc" },
  });
}

export function listManagerCandidates(organizationId: string) {
  return db.hrEmployee.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "ON_LEAVE"] } },
    orderBy: { fullName: "asc" },
  });
}

async function generateEmployeeNumber(organizationId: string) {
  const count = await db.hrEmployee.count({ where: { organizationId } });
  return `EMP-${String(count + 1).padStart(4, "0")}`;
}

interface EmployeeInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  hireDate: Date;
  managerId?: string | null;
  notes?: string | null;
}

export async function createEmployee(organizationId: string, data: EmployeeInput) {
  if (data.managerId) await requireEmployee(organizationId, data.managerId);
  const employeeNumber = await generateEmployeeNumber(organizationId);
  return db.hrEmployee.create({ data: { organizationId, employeeNumber, ...data } });
}

export async function updateEmployee(organizationId: string, id: string, data: EmployeeInput) {
  if (data.managerId) await requireEmployee(organizationId, data.managerId);
  return db.hrEmployee.update({ where: { id, organizationId }, data });
}

export class EmployeeStateError extends Error {}

export async function activateEmployee(organizationId: string, id: string) {
  const employee = await db.hrEmployee.findFirst({ where: { id, organizationId } });
  if (!employee) throw new Error("Employee not found.");
  if (employee.status !== "ONBOARDING") throw new EmployeeStateError("Only employees in onboarding can be activated.");
  return db.hrEmployee.update({ where: { id }, data: { status: "ACTIVE" } });
}

export function setEmployeeStatus(organizationId: string, id: string, status: HrEmployeeStatus) {
  return db.hrEmployee.update({
    where: { id, organizationId },
    data: { status, terminationDate: status === "TERMINATED" ? new Date() : undefined },
  });
}

// --- Leave types ---

export function listLeaveTypes(organizationId: string) {
  return db.hrLeaveType.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createLeaveType(organizationId: string, data: { name: string; defaultDaysPerYear: number }) {
  return db.hrLeaveType.create({ data: { organizationId, ...data } });
}

// --- Leave requests ---

export function listLeaveRequests(organizationId: string) {
  return db.hrLeaveRequest.findMany({
    where: { organizationId },
    include: { employee: true, leaveType: true, approvedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

export function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86400000) + 1;
}

interface LeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
}

export class LeaveDateError extends Error {}

export async function createLeaveRequest(organizationId: string, data: LeaveRequestInput) {
  if (data.endDate < data.startDate) throw new LeaveDateError("End date must be on or after the start date.");
  await requireEmployee(organizationId, data.employeeId);
  const leaveType = await db.hrLeaveType.findFirst({ where: { id: data.leaveTypeId, organizationId } });
  if (!leaveType) throw new NotFoundError("Leave type not found.");
  return db.hrLeaveRequest.create({ data: { organizationId, ...data } });
}

export class LeaveStateError extends Error {}

export async function approveLeaveRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.hrLeaveRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new Error("Leave request not found.");
  if (request.status !== "PENDING") throw new LeaveStateError("Only pending leave requests can be approved.");
  return db.hrLeaveRequest.update({ where: { id }, data: { status: "APPROVED", approvedById, approvedAt: new Date() } });
}

export async function rejectLeaveRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.hrLeaveRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new Error("Leave request not found.");
  if (request.status !== "PENDING") throw new LeaveStateError("Only pending leave requests can be rejected.");
  return db.hrLeaveRequest.update({ where: { id }, data: { status: "REJECTED", approvedById, approvedAt: new Date() } });
}

// --- Performance reviews ---

export function listReviews(organizationId: string) {
  return db.hrPerformanceReview.findMany({
    where: { organizationId },
    include: { employee: true, reviewedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

interface ReviewInput {
  employeeId: string;
  reviewPeriodStart: Date;
  reviewPeriodEnd: Date;
  rating?: number | null;
  summary?: string | null;
  reviewedById?: string | null;
}

export async function createReview(organizationId: string, data: ReviewInput) {
  await requireEmployee(organizationId, data.employeeId);
  return db.hrPerformanceReview.create({ data: { organizationId, ...data, status: "DRAFT" } });
}

export class ReviewStateError extends Error {}

export async function completeReview(organizationId: string, id: string) {
  const review = await db.hrPerformanceReview.findFirst({ where: { id, organizationId } });
  if (!review) throw new Error("Review not found.");
  if (review.status !== "DRAFT") throw new ReviewStateError("Only draft reviews can be completed.");
  if (review.rating === null) throw new ReviewStateError("A rating is required before completing a review.");
  return db.hrPerformanceReview.update({ where: { id }, data: { status: "COMPLETED", reviewDate: new Date() } });
}

// --- Reports ---

export async function getHrSummary(organizationId: string) {
  const employees = await db.hrEmployee.findMany({ where: { organizationId } });
  const activeEmployees = employees.filter((e) => e.status === "ACTIVE");
  const onboardingEmployees = employees.filter((e) => e.status === "ONBOARDING");
  const onLeaveEmployees = employees.filter((e) => e.status === "ON_LEAVE");

  const departmentCounts = employees.reduce<Record<string, number>>((acc, e) => {
    if (e.status === "TERMINATED") return acc;
    const key = e.department ?? "Unassigned";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const [pendingLeaveCount, draftReviewCount] = await Promise.all([
    db.hrLeaveRequest.count({ where: { organizationId, status: "PENDING" } }),
    db.hrPerformanceReview.count({ where: { organizationId, status: "DRAFT" } }),
  ]);

  return {
    totalEmployees: employees.length,
    activeEmployeeCount: activeEmployees.length,
    onboardingCount: onboardingEmployees.length,
    onLeaveCount: onLeaveEmployees.length,
    pendingLeaveCount,
    draftReviewCount,
    departmentCounts,
  };
}
