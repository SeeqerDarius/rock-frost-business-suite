import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("School student profile controls", () => {
  const service = read("src/modules/school/student-profile-service.ts");
  const page = read("src/app/app/school/students/[studentId]/page.tsx");
  const hostel = read("src/modules/school/hostel-integration.ts");

  it("enforces sensitive field access in service queries", () => {
    expect(service).toContain("omit: { medicalNotes: true, allergies: true, accessibilityNotes: true, bloodGroup: true }");
    expect(service).toContain("access.medical ? db.schoolStudent.findFirst");
    expect(service).toContain("access.finance ? db.schoolFeeInvoice.findMany");
    expect(service).toContain("access.conduct ? db.schoolConductRecord.findMany");
    expect(page).toContain("medical: canMedical");
  });

  it("uses an opaque signed and revocable public identity", () => {
    expect(service).toContain("randomBytes(24)");
    expect(service).toContain('createHmac("sha256"');
    expect(service).toContain('card.status !== "ACTIVE"');
    expect(service).toContain("card.expiryDate <= new Date()");
  });

  it("keeps Hostel ownership behind an explicit tenant-scoped service", () => {
    expect(page).toContain("getStudentHostelSummary");
    expect(page).not.toContain("db.hostel");
    expect(hostel).toContain("where: { organizationId, studentId }");
    expect(page).toContain('tenant.enabledModuleKeys.includes("hostel")');
    expect(page).toContain("PERMISSIONS.HOSTEL_VIEW");
  });

  it("uses organization currency and supports direct section links", () => {
    expect(page).toContain("tenant.organization.currency");
    expect(page).toContain("?section=${key}");
    expect(page).toContain("Download wallet-size ID PDF");
  });

  it("builds the School dashboard from server aggregates with permission-gated finance", () => {
    const dashboard = read("src/modules/school/dashboard-service.ts");
    const dashboardPage = read("src/app/app/school/page.tsx");
    expect(dashboard).toContain("getSchoolOperationalDashboard");
    expect(dashboard).toContain("options.financial && term ? db.schoolFeeInvoice.aggregate");
    expect(dashboard).toContain("refundedAt: null");
    expect(dashboard).toContain("incompleteRegisters");
    expect(dashboardPage).toContain("SCHOOL_DASHBOARD_FINANCIAL_VIEW");
    expect(dashboardPage).toContain("No register");
    expect(dashboardPage).toContain("Updated");
  });
});
