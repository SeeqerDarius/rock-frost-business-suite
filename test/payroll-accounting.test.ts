import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ postPayrollRunAccrual: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/accounting-integration", () => ({ postPayrollRunAccrual: mocks.postPayrollRunAccrual }));
vi.mock("@/lib/db", () => ({ db: { payrollRun: { updateMany: mocks.updateMany } } }));

const { Prisma } = await import("@prisma/client");
const { postPayrollRunAccounting } = await import("@/modules/payroll/accounting");

const run: Parameters<typeof postPayrollRunAccounting>[1] = {
  id: "run-1",
  organizationId: "org-1",
  periodStart: new Date("2026-09-01T00:00:00Z"),
  periodEnd: new Date("2026-09-30T00:00:00Z"),
  payDate: new Date("2026-10-01T00:00:00Z"),
  status: "COMPLETED",
  postingStatus: "PENDING",
  createdById: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  payslips: [
    { id: "slip-1", organizationId: "org-1", payrollRunId: "run-1", employeeId: "employee-1", createdAt: new Date(), grossPay: new Prisma.Decimal("1000.00"), netPay: new Prisma.Decimal("800.00"), taxDeduction: new Prisma.Decimal("200.00"), otherDeductions: new Prisma.Decimal("0"), employerContributions: new Prisma.Decimal("0") },
    { id: "slip-2", organizationId: "org-1", payrollRunId: "run-1", employeeId: "employee-2", createdAt: new Date(), grossPay: new Prisma.Decimal("500.00"), netPay: new Prisma.Decimal("400.00"), taxDeduction: new Prisma.Decimal("100.00"), otherDeductions: new Prisma.Decimal("0"), employerContributions: new Prisma.Decimal("0") },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("Payroll run Accounting accrual", () => {
  it("posts exact gross, net, and deduction totals and records POSTED", async () => {
    mocks.postPayrollRunAccrual.mockResolvedValue({ posted: true, journalEntryId: "journal-1" });
    await postPayrollRunAccounting("org-1", run, "user-1");
    expect(mocks.postPayrollRunAccrual).toHaveBeenCalledWith("org-1", expect.objectContaining({ runId: "run-1", grossPay: "1500.00", netPay: "1200.00", deductions: "300.00", actorId: "user-1" }));
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "run-1", organizationId: "org-1", status: "COMPLETED" }, data: { postingStatus: "POSTED" } });
  });

  it("records failed Accounting delivery for an authorized retry", async () => {
    mocks.postPayrollRunAccrual.mockResolvedValue({ posted: false, reason: "error" });
    await postPayrollRunAccounting("org-1", run);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { postingStatus: "FAILED" } }));
  });

  it("preserves the run as not requiring Accounting when the module is inactive", async () => {
    mocks.postPayrollRunAccrual.mockResolvedValue({ posted: false, reason: "accounting-not-enabled" });
    await postPayrollRunAccounting("org-1", run);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { postingStatus: "NOT_REQUIRED" } }));
  });
});
