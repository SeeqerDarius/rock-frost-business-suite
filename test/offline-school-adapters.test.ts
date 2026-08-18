import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TenantContext } from "@/lib/tenant";
import type { OfflineMutationInput } from "@/lib/offline-sync/contract";

/**
 * Regression tests for the School offline adapters
 * (src/lib/offline-sync/modules/school.adapters.ts): milestone 6's
 * campus/academic-year/term slice plus milestone 7's students, guardians,
 * classes, subjects, enrollment, and attendance. Permission gating per
 * action and that each action calls the exact same @/modules/school/
 * service function the web UI calls - exercised through the real
 * dispatcher (applyOfflineMutation), matching the established POS adapter
 * test convention (test/offline-pos-adapters.test.ts).
 */

const mockSchoolService = {
  createSchoolCampus: vi.fn(),
  createSchoolAcademicYear: vi.fn(),
  createSchoolTerm: vi.fn(),
  createSchoolStudent: vi.fn(),
  transitionSchoolStudent: vi.fn(),
  createSchoolGuardian: vi.fn(),
  linkSchoolGuardian: vi.fn(),
  createSchoolClass: vi.fn(),
  createSchoolSubject: vi.fn(),
  enrollSchoolStudent: vi.fn(),
  recordSchoolAttendance: vi.fn(),
  createSchoolFeeInvoice: vi.fn(),
  recordSchoolFeePayment: vi.fn(),
  createSchoolFeeStructure: vi.fn(),
  issueSchoolFeeStructure: vi.fn(),
  createSchoolExam: vi.fn(),
  recordSchoolExamResult: vi.fn(),
  submitSchoolExamForModeration: vi.fn(),
  publishSchoolExam: vi.fn(),
  createSchoolTimetableEntry: vi.fn(),
  createSchoolLibraryBook: vi.fn(),
  borrowSchoolLibraryBook: vi.fn(),
  returnSchoolLibraryBook: vi.fn(),
  createSchoolTransportRoute: vi.fn(),
  assignSchoolTransport: vi.fn(),
  createSchoolPayrollAdjustment: vi.fn(),
  upsertSchoolSettings: vi.fn(),
};

const mockDb = {
  schoolStudent: { findFirst: vi.fn() },
  schoolSettings: { findFirst: vi.fn() },
};

vi.mock("@/modules/school/service", () => mockSchoolService);
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Only school.adapters.ts is under test; the other module adapter files
// import real service functions too, but applyOfflineMutation only loads
// what a given mutation's entityType actually resolves to, so no further
// mocking is needed here.

const { applyOfflineMutation, OfflineMutationDeniedError } = await import("@/lib/offline-sync/adapters");

function tenant(permissions: string[]): TenantContext {
  return { organizationId: "org-1", userId: "user-1", enabledModuleKeys: ["school"], permissions } as unknown as TenantContext;
}

function mutation(overrides: Partial<OfflineMutationInput> & { entityType: string }): OfflineMutationInput {
  return {
    mutationId: "6a3c1a3e-df1c-4b7e-9a3e-6f4f8c9d2b11",
    organizationId: "org-1",
    moduleKey: "school",
    entityId: "e1",
    operation: "CREATE",
    baseVersion: 0,
    changedAt: new Date("2026-08-17T00:00:00.000Z"),
    payload: {},
    ...overrides,
  } as OfflineMutationInput;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("school.campus", () => {
  it("requires school.campuses.manage and calls createSchoolCampus", async () => {
    mockSchoolService.createSchoolCampus.mockResolvedValue({ id: "c1", name: "Main Campus" });
    const result = await applyOfflineMutation(
      tenant(["school.campuses.manage"]),
      mutation({ entityType: "school.campus", payload: { code: "MAIN", name: "Main Campus" } }),
    );
    expect(mockSchoolService.createSchoolCampus).toHaveBeenCalledWith("org-1", { code: "MAIN", name: "Main Campus" });
    expect(result).toEqual({ id: "c1", name: "Main Campus" });
  });

  it("is denied without school.campuses.manage, and createSchoolCampus is never called", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.campus", payload: { code: "MAIN", name: "Main Campus" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    expect(mockSchoolService.createSchoolCampus).not.toHaveBeenCalled();
  });

  it("rejects a payload missing required fields before calling the service", async () => {
    await expect(
      applyOfflineMutation(tenant(["school.campuses.manage"]), mutation({ entityType: "school.campus", payload: { code: "MAIN" } })),
    ).rejects.toMatchObject({ conflictType: "INVALID_PAYLOAD" });
    expect(mockSchoolService.createSchoolCampus).not.toHaveBeenCalled();
  });
});

describe("school.academic_year", () => {
  it("requires school.academics.manage and calls createSchoolAcademicYear", async () => {
    mockSchoolService.createSchoolAcademicYear.mockResolvedValue({ id: "y1", name: "2026/2027" });
    const result = await applyOfflineMutation(
      tenant(["school.academics.manage"]),
      mutation({ entityType: "school.academic_year", payload: { name: "2026/2027", startDate: "2026-09-01", endDate: "2027-07-31", current: true } }),
    );
    expect(mockSchoolService.createSchoolAcademicYear).toHaveBeenCalledWith("org-1", {
      name: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      current: true,
    });
    expect(result).toEqual({ id: "y1", name: "2026/2027" });
  });

  it("surfaces the service's own date-ordering rule as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.createSchoolAcademicYear.mockRejectedValue(new SchoolStateError("Academic year end date must follow its start date."));
    await expect(
      applyOfflineMutation(
        tenant(["school.academics.manage"]),
        mutation({ entityType: "school.academic_year", payload: { name: "Bad Year", startDate: "2026-09-01", endDate: "2026-01-01" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.academics.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.academic_year", payload: { name: "2026/2027", startDate: "2026-09-01", endDate: "2027-07-31" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.term", () => {
  it("requires school.academics.manage and calls createSchoolTerm", async () => {
    mockSchoolService.createSchoolTerm.mockResolvedValue({ id: "t1", name: "Term 1" });
    const result = await applyOfflineMutation(
      tenant(["school.academics.manage"]),
      mutation({ entityType: "school.term", payload: { academicYearId: "y1", name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" } }),
    );
    expect(mockSchoolService.createSchoolTerm).toHaveBeenCalledWith("org-1", {
      academicYearId: "y1",
      name: "Term 1",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
    });
    expect(result).toEqual({ id: "t1", name: "Term 1" });
  });

  it("surfaces a not-found academic year as a conflict rather than a crash", async () => {
    class SchoolNotFoundError extends Error {}
    mockSchoolService.createSchoolTerm.mockRejectedValue(new SchoolNotFoundError("Academic year not found."));
    await expect(
      applyOfflineMutation(
        tenant(["school.academics.manage"]),
        mutation({ entityType: "school.term", payload: { academicYearId: "missing", name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.academics.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.term", payload: { academicYearId: "y1", name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.student", () => {
  it("requires school.students.manage and calls createSchoolStudent", async () => {
    mockSchoolService.createSchoolStudent.mockResolvedValue({ id: "s1", admissionNumber: "STU-00001" });
    const result = await applyOfflineMutation(
      tenant(["school.students.manage"]),
      mutation({ entityType: "school.student", payload: { campusId: "c1", firstName: "Ama", lastName: "Owusu" } }),
    );
    expect(mockSchoolService.createSchoolStudent).toHaveBeenCalledWith("org-1", { campusId: "c1", firstName: "Ama", lastName: "Owusu" });
    expect(result).toEqual({ id: "s1", admissionNumber: "STU-00001" });
  });

  it("is denied without school.students.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.student", payload: { campusId: "c1", firstName: "Ama", lastName: "Owusu" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.student_status_transition", () => {
  it("UPDATE succeeds and calls transitionSchoolStudent when baseVersion matches the current server version", async () => {
    const updatedAt = new Date("2026-08-17T00:00:00.000Z");
    mockDb.schoolStudent.findFirst.mockResolvedValue({ updatedAt });
    mockSchoolService.transitionSchoolStudent.mockResolvedValue({ id: "s1", status: "SUSPENDED" });
    const result = await applyOfflineMutation(
      tenant(["school.students.manage"]),
      mutation({ entityType: "school.student_status_transition", operation: "UPDATE", entityId: "s1", baseVersion: updatedAt.getTime(), payload: { toStatus: "SUSPENDED", reason: "Fees overdue" } }),
    );
    expect(mockSchoolService.transitionSchoolStudent).toHaveBeenCalledWith("org-1", "s1", "SUSPENDED", "Fees overdue");
    expect(result).toEqual({ id: "s1", status: "SUSPENDED" });
  });

  it("rejects a stale baseVersion as a conflict without calling transitionSchoolStudent, and reports the current cloud status", async () => {
    const updatedAt = new Date("2026-08-17T00:00:00.000Z");
    mockDb.schoolStudent.findFirst.mockResolvedValue({ status: "ACTIVE", updatedAt });
    await expect(
      applyOfflineMutation(
        tenant(["school.students.manage"]),
        mutation({ entityType: "school.student_status_transition", operation: "UPDATE", entityId: "s1", baseVersion: 1, payload: { toStatus: "SUSPENDED" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "STALE_VERSION", cloudVersion: updatedAt.getTime(), cloudSnapshot: { status: "ACTIVE" } });
    expect(mockSchoolService.transitionSchoolStudent).not.toHaveBeenCalled();
  });

  it("a student that does not yet exist server-side (still pending its own offline create) conflicts as ENTITY_DELETED rather than crashing", async () => {
    mockDb.schoolStudent.findFirst.mockResolvedValue(null);
    await expect(
      applyOfflineMutation(
        tenant(["school.students.manage"]),
        mutation({ entityType: "school.student_status_transition", operation: "UPDATE", entityId: "local-pending-id", baseVersion: 0, payload: { toStatus: "ACTIVE" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "ENTITY_DELETED" });
  });

  it("is denied without school.students.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.student_status_transition", operation: "UPDATE", entityId: "s1", payload: { toStatus: "ACTIVE" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.guardian / school.guardian_link", () => {
  it("guardian create requires school.students.manage and calls createSchoolGuardian", async () => {
    mockSchoolService.createSchoolGuardian.mockResolvedValue({ id: "g1", guardianNumber: "GRD-00001" });
    const result = await applyOfflineMutation(
      tenant(["school.students.manage"]),
      mutation({ entityType: "school.guardian", payload: { firstName: "Kofi", lastName: "Owusu", email: null, phone: "0244000000" } }),
    );
    expect(mockSchoolService.createSchoolGuardian).toHaveBeenCalledWith("org-1", { firstName: "Kofi", lastName: "Owusu", email: null, phone: "0244000000" });
    expect(result).toEqual({ id: "g1", guardianNumber: "GRD-00001" });
  });

  it("guardian_link calls linkSchoolGuardian with its positional arguments", async () => {
    mockSchoolService.linkSchoolGuardian.mockResolvedValue({ studentId: "s1", guardianId: "g1" });
    const result = await applyOfflineMutation(
      tenant(["school.students.manage"]),
      mutation({ entityType: "school.guardian_link", payload: { studentId: "s1", guardianId: "g1", relationship: "Father", primary: true } }),
    );
    expect(mockSchoolService.linkSchoolGuardian).toHaveBeenCalledWith("org-1", "s1", "g1", "Father", true);
    expect(result).toEqual({ studentId: "s1", guardianId: "g1" });
  });

  it("both are denied without school.students.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.guardian", payload: { firstName: "Kofi", lastName: "Owusu", email: null, phone: "0244000000" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.guardian_link", payload: { studentId: "s1", guardianId: "g1", relationship: "Father", primary: true } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.class / school.subject", () => {
  it("both require school.academics.manage and call the matching service function", async () => {
    mockSchoolService.createSchoolClass.mockResolvedValue({ id: "cl1", name: "Primary 1" });
    mockSchoolService.createSchoolSubject.mockResolvedValue({ id: "sub1", name: "Mathematics" });

    await applyOfflineMutation(tenant(["school.academics.manage"]), mutation({ entityType: "school.class", payload: { campusId: "c1", code: "P1", name: "Primary 1" } }));
    expect(mockSchoolService.createSchoolClass).toHaveBeenCalledWith("org-1", { campusId: "c1", code: "P1", name: "Primary 1" });

    await applyOfflineMutation(tenant(["school.academics.manage"]), mutation({ entityType: "school.subject", payload: { code: "MATH", name: "Mathematics" } }));
    expect(mockSchoolService.createSchoolSubject).toHaveBeenCalledWith("org-1", { code: "MATH", name: "Mathematics" });
  });

  it("both are denied without school.academics.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.class", payload: { campusId: "c1", code: "P1", name: "Primary 1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.enrollment", () => {
  it("requires school.enrollment.manage and calls enrollSchoolStudent", async () => {
    mockSchoolService.enrollSchoolStudent.mockResolvedValue({ id: "e1", classId: "cl1" });
    const result = await applyOfflineMutation(
      tenant(["school.enrollment.manage"]),
      mutation({ entityType: "school.enrollment", payload: { campusId: "c1", academicYearId: "y1", studentId: "s1", classId: "cl1" } }),
    );
    expect(mockSchoolService.enrollSchoolStudent).toHaveBeenCalledWith("org-1", { campusId: "c1", academicYearId: "y1", studentId: "s1", classId: "cl1" });
    expect(result).toEqual({ id: "e1", classId: "cl1" });
  });

  it("a full class surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.enrollSchoolStudent.mockRejectedValue(new SchoolStateError("Class capacity has been reached."));
    await expect(
      applyOfflineMutation(
        tenant(["school.enrollment.manage"]),
        mutation({ entityType: "school.enrollment", payload: { campusId: "c1", academicYearId: "y1", studentId: "s1", classId: "cl1" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.enrollment.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.enrollment", payload: { campusId: "c1", academicYearId: "y1", studentId: "s1", classId: "cl1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.attendance", () => {
  it("requires school.attendance.manage and calls recordSchoolAttendance", async () => {
    mockSchoolService.recordSchoolAttendance.mockResolvedValue({ id: "a1", status: "PRESENT" });
    const result = await applyOfflineMutation(
      tenant(["school.attendance.manage"]),
      mutation({ entityType: "school.attendance", payload: { termId: "t1", classId: "cl1", studentId: "s1", date: "2026-08-17", status: "PRESENT" } }),
    );
    expect(mockSchoolService.recordSchoolAttendance).toHaveBeenCalledWith("org-1", "user-1", { termId: "t1", classId: "cl1", studentId: "s1", date: new Date("2026-08-17"), status: "PRESENT" });
    expect(result).toEqual({ id: "a1", status: "PRESENT" });
  });

  it("the closed correction window surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.recordSchoolAttendance.mockRejectedValue(new SchoolStateError("The attendance correction window has closed."));
    await expect(
      applyOfflineMutation(
        tenant(["school.attendance.manage"]),
        mutation({ entityType: "school.attendance", payload: { termId: "t1", classId: "cl1", studentId: "s1", date: "2026-01-01", status: "PRESENT" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.attendance.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.attendance", payload: { termId: "t1", classId: "cl1", studentId: "s1", date: "2026-08-17", status: "PRESENT" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.fee_invoice", () => {
  it("requires school.fees.manage and calls createSchoolFeeInvoice", async () => {
    mockSchoolService.createSchoolFeeInvoice.mockResolvedValue({ id: "inv1", invoiceNumber: "INV-00001" });
    const result = await applyOfflineMutation(
      tenant(["school.fees.manage"]),
      mutation({ entityType: "school.fee_invoice", payload: { academicYearId: "y1", studentId: "s1", description: "Term 1 fees", amount: "500.00" } }),
    );
    expect(mockSchoolService.createSchoolFeeInvoice).toHaveBeenCalledWith("org-1", { academicYearId: "y1", studentId: "s1", description: "Term 1 fees", amount: "500.00" });
    expect(result).toEqual({ id: "inv1", invoiceNumber: "INV-00001" });
  });

  it("is denied without school.fees.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.fee_invoice", payload: { academicYearId: "y1", studentId: "s1", description: "Term 1 fees", amount: "500.00" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.fee_payment", () => {
  it("requires school.fees.manage and calls recordSchoolFeePayment with invoiceId split out of the payload", async () => {
    mockSchoolService.recordSchoolFeePayment.mockResolvedValue({ id: "pay1", receiptNumber: "SCH-00001" });
    const result = await applyOfflineMutation(
      tenant(["school.fees.manage"]),
      mutation({ entityType: "school.fee_payment", payload: { invoiceId: "inv1", amount: "200.00", method: "CASH" } }),
    );
    expect(mockSchoolService.recordSchoolFeePayment).toHaveBeenCalledWith("org-1", "inv1", { amount: "200.00", method: "CASH" });
    expect(result).toEqual({ id: "pay1", receiptNumber: "SCH-00001" });
  });

  it("a payment exceeding the outstanding balance surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.recordSchoolFeePayment.mockRejectedValue(new SchoolStateError("Payment exceeds the outstanding invoice balance."));
    await expect(
      applyOfflineMutation(
        tenant(["school.fees.manage"]),
        mutation({ entityType: "school.fee_payment", payload: { invoiceId: "inv1", amount: "9999.00", method: "CASH" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.fees.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.fee_payment", payload: { invoiceId: "inv1", amount: "200.00", method: "CASH" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.fee_structure", () => {
  it("requires school.fees.manage and calls createSchoolFeeStructure", async () => {
    mockSchoolService.createSchoolFeeStructure.mockResolvedValue({ id: "fs1", name: "Term 1 tuition" });
    const result = await applyOfflineMutation(
      tenant(["school.fees.manage"]),
      mutation({ entityType: "school.fee_structure", payload: { campusId: "c1", academicYearId: "y1", name: "Term 1 tuition", amount: "500.00" } }),
    );
    expect(mockSchoolService.createSchoolFeeStructure).toHaveBeenCalledWith("org-1", { campusId: "c1", academicYearId: "y1", name: "Term 1 tuition", amount: "500.00" });
    expect(result).toEqual({ id: "fs1", name: "Term 1 tuition" });
  });

  it("is denied without school.fees.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.fee_structure", payload: { campusId: "c1", academicYearId: "y1", name: "Term 1 tuition", amount: "500.00" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.fee_structure_issuance", () => {
  it("requires school.fees.manage and calls issueSchoolFeeStructure, returning its eligible/issued/skipped counts", async () => {
    mockSchoolService.issueSchoolFeeStructure.mockResolvedValue({ eligible: 30, issued: 28, skipped: 2 });
    const result = await applyOfflineMutation(
      tenant(["school.fees.manage"]),
      mutation({ entityType: "school.fee_structure_issuance", payload: { feeStructureId: "fs1" } }),
    );
    expect(mockSchoolService.issueSchoolFeeStructure).toHaveBeenCalledWith("org-1", "fs1");
    expect(result).toEqual({ eligible: 30, issued: 28, skipped: 2 });
  });

  it("an inactive fee structure surfaces as a conflict rather than a crash", async () => {
    class SchoolNotFoundError extends Error {}
    mockSchoolService.issueSchoolFeeStructure.mockRejectedValue(new SchoolNotFoundError("Active fee structure not found."));
    await expect(
      applyOfflineMutation(tenant(["school.fees.manage"]), mutation({ entityType: "school.fee_structure_issuance", payload: { feeStructureId: "fs1" } })),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.fees.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.fee_structure_issuance", payload: { feeStructureId: "fs1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.exam", () => {
  it("requires school.exams.manage and calls createSchoolExam", async () => {
    mockSchoolService.createSchoolExam.mockResolvedValue({ id: "ex1", name: "Midterm" });
    const result = await applyOfflineMutation(
      tenant(["school.exams.manage"]),
      mutation({ entityType: "school.exam", payload: { academicYearId: "y1", termId: "t1", subjectId: "sub1", name: "Midterm", totalMarks: "100.00", weight: "40.00" } }),
    );
    expect(mockSchoolService.createSchoolExam).toHaveBeenCalledWith("org-1", { academicYearId: "y1", termId: "t1", subjectId: "sub1", name: "Midterm", totalMarks: "100.00", weight: "40.00" });
    expect(result).toEqual({ id: "ex1", name: "Midterm" });
  });

  it("is denied without school.exams.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.exam", payload: { academicYearId: "y1", termId: "t1", subjectId: "sub1", name: "Midterm", totalMarks: "100.00", weight: "40.00" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.exam_result", () => {
  it("requires school.exams.manage and calls recordSchoolExamResult", async () => {
    mockSchoolService.recordSchoolExamResult.mockResolvedValue({ id: "res1", marks: 72, grade: "B" });
    const result = await applyOfflineMutation(
      tenant(["school.exams.manage"]),
      mutation({ entityType: "school.exam_result", payload: { examId: "ex1", studentId: "s1", classId: "cl1", subjectId: "sub1", marks: 72 } }),
    );
    expect(mockSchoolService.recordSchoolExamResult).toHaveBeenCalledWith("org-1", "user-1", { examId: "ex1", studentId: "s1", classId: "cl1", subjectId: "sub1", marks: 72 });
    expect(result).toEqual({ id: "res1", marks: "72", grade: "B" });
  });

  it("marks outside the exam total surface as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.recordSchoolExamResult.mockRejectedValue(new SchoolStateError("Marks must be within the exam total."));
    await expect(
      applyOfflineMutation(
        tenant(["school.exams.manage"]),
        mutation({ entityType: "school.exam_result", payload: { examId: "ex1", studentId: "s1", classId: "cl1", subjectId: "sub1", marks: 9999 } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.exams.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.exam_result", payload: { examId: "ex1", studentId: "s1", classId: "cl1", subjectId: "sub1", marks: 72 } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.exam_moderation_submit", () => {
  it("requires school.exams.manage and calls submitSchoolExamForModeration", async () => {
    mockSchoolService.submitSchoolExamForModeration.mockResolvedValue({ id: "ex1", status: "MODERATION" });
    const result = await applyOfflineMutation(
      tenant(["school.exams.manage"]),
      mutation({ entityType: "school.exam_moderation_submit", payload: { examId: "ex1" } }),
    );
    expect(mockSchoolService.submitSchoolExamForModeration).toHaveBeenCalledWith("org-1", "ex1");
    expect(result).toEqual({ id: "ex1", status: "MODERATION" });
  });

  it("an exam with no results surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.submitSchoolExamForModeration.mockRejectedValue(new SchoolStateError("Only open exams with results can be submitted for moderation."));
    await expect(
      applyOfflineMutation(tenant(["school.exams.manage"]), mutation({ entityType: "school.exam_moderation_submit", payload: { examId: "ex1" } })),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.exams.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.exam_moderation_submit", payload: { examId: "ex1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.exam_publish", () => {
  it("requires school.exams.publish (not school.exams.manage) and calls publishSchoolExam", async () => {
    mockSchoolService.publishSchoolExam.mockResolvedValue([{ count: 5 }, { id: "ex1", status: "PUBLISHED" }]);
    const result = await applyOfflineMutation(
      tenant(["school.exams.publish"]),
      mutation({ entityType: "school.exam_publish", payload: { examId: "ex1" } }),
    );
    expect(mockSchoolService.publishSchoolExam).toHaveBeenCalledWith("org-1", "ex1");
    expect(result).toEqual({ id: "ex1", status: "PUBLISHED" });
  });

  it("is denied when only school.exams.manage is held, not school.exams.publish", async () => {
    await expect(
      applyOfflineMutation(tenant(["school.exams.manage"]), mutation({ entityType: "school.exam_publish", payload: { examId: "ex1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });

  it("an exam not yet in moderation surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.publishSchoolExam.mockRejectedValue(new SchoolStateError("Only moderated exams with results can be published."));
    await expect(
      applyOfflineMutation(tenant(["school.exams.publish"]), mutation({ entityType: "school.exam_publish", payload: { examId: "ex1" } })),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });
});

describe("school.timetable_entry", () => {
  it("requires school.timetables.manage and calls createSchoolTimetableEntry", async () => {
    mockSchoolService.createSchoolTimetableEntry.mockResolvedValue({ id: "tt1", classId: "cl1" });
    const result = await applyOfflineMutation(
      tenant(["school.timetables.manage"]),
      mutation({ entityType: "school.timetable_entry", payload: { campusId: "c1", termId: "t1", classId: "cl1", subjectId: "sub1", teacherName: "Ms. Mensah", dayOfWeek: 1, startsAt: "08:00", endsAt: "09:00" } }),
    );
    expect(mockSchoolService.createSchoolTimetableEntry).toHaveBeenCalledWith("org-1", { campusId: "c1", termId: "t1", classId: "cl1", subjectId: "sub1", teacherName: "Ms. Mensah", dayOfWeek: 1, startsAt: "08:00", endsAt: "09:00" });
    expect(result).toEqual({ id: "tt1", classId: "cl1" });
  });

  it("a conflicting class/teacher/room period surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.createSchoolTimetableEntry.mockRejectedValue(new SchoolStateError("Timetable conflicts with an existing class, teacher, or room period."));
    await expect(
      applyOfflineMutation(
        tenant(["school.timetables.manage"]),
        mutation({ entityType: "school.timetable_entry", payload: { campusId: "c1", termId: "t1", classId: "cl1", subjectId: "sub1", teacherName: "Ms. Mensah", dayOfWeek: 1, startsAt: "08:00", endsAt: "09:00" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.timetables.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.timetable_entry", payload: { campusId: "c1", termId: "t1", classId: "cl1", subjectId: "sub1", teacherName: "Ms. Mensah", dayOfWeek: 1, startsAt: "08:00", endsAt: "09:00" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.library_book / school.library_loan / school.library_loan_return", () => {
  it("book create requires school.library.manage and calls createSchoolLibraryBook", async () => {
    mockSchoolService.createSchoolLibraryBook.mockResolvedValue({ id: "b1", accessionCode: "ACC-1" });
    const result = await applyOfflineMutation(
      tenant(["school.library.manage"]),
      mutation({ entityType: "school.library_book", payload: { accessionCode: "ACC-1", title: "Algebra I", totalCopies: 3 } }),
    );
    expect(mockSchoolService.createSchoolLibraryBook).toHaveBeenCalledWith("org-1", { accessionCode: "ACC-1", title: "Algebra I", totalCopies: 3 });
    expect(result).toEqual({ id: "b1", accessionCode: "ACC-1" });
  });

  it("borrow calls borrowSchoolLibraryBook with its positional arguments", async () => {
    mockSchoolService.borrowSchoolLibraryBook.mockResolvedValue({ id: "ln1", bookId: "b1" });
    const result = await applyOfflineMutation(
      tenant(["school.library.manage"]),
      mutation({ entityType: "school.library_loan", payload: { bookId: "b1", studentId: "s1", dueAt: "2026-08-31" } }),
    );
    expect(mockSchoolService.borrowSchoolLibraryBook).toHaveBeenCalledWith("org-1", "b1", "s1", new Date("2026-08-31"));
    expect(result).toEqual({ id: "ln1", bookId: "b1" });
  });

  it("no available copy surfaces as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.borrowSchoolLibraryBook.mockRejectedValue(new SchoolStateError("No copy is available."));
    await expect(
      applyOfflineMutation(tenant(["school.library.manage"]), mutation({ entityType: "school.library_loan", payload: { bookId: "b1", studentId: "s1", dueAt: "2026-08-31" } })),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("return is a CREATE event that calls returnSchoolLibraryBook with the real loanId from the payload", async () => {
    mockSchoolService.returnSchoolLibraryBook.mockResolvedValue({ id: "ln1", status: "RETURNED" });
    const result = await applyOfflineMutation(
      tenant(["school.library.manage"]),
      mutation({ entityType: "school.library_loan_return", entityId: "correlation-1", payload: { loanId: "ln1" } }),
    );
    expect(mockSchoolService.returnSchoolLibraryBook).toHaveBeenCalledWith("org-1", "ln1");
    expect(result).toEqual({ id: "ln1", status: "RETURNED" });
  });

  it("all three are denied without school.library.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.library_book", payload: { accessionCode: "ACC-1", title: "Algebra I", totalCopies: 3 } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.library_loan", payload: { bookId: "b1", studentId: "s1", dueAt: "2026-08-31" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.library_loan_return", payload: { loanId: "ln1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.transport_route / school.transport_assignment", () => {
  it("route create requires school.transport.manage and calls createSchoolTransportRoute", async () => {
    mockSchoolService.createSchoolTransportRoute.mockResolvedValue({ id: "rt1", name: "Route 1" });
    const result = await applyOfflineMutation(
      tenant(["school.transport.manage"]),
      mutation({ entityType: "school.transport_route", payload: { campusId: "c1", code: "R1", name: "Route 1", fee: 50 } }),
    );
    expect(mockSchoolService.createSchoolTransportRoute).toHaveBeenCalledWith("org-1", { campusId: "c1", code: "R1", name: "Route 1", fee: 50 });
    expect(result).toEqual({ id: "rt1", name: "Route 1" });
  });

  it("assignment calls assignSchoolTransport with its positional arguments, idempotent server-side via its own upsert", async () => {
    mockSchoolService.assignSchoolTransport.mockResolvedValue({ routeId: "rt1", studentId: "s1" });
    const result = await applyOfflineMutation(
      tenant(["school.transport.manage"]),
      mutation({ entityType: "school.transport_assignment", payload: { routeId: "rt1", studentId: "s1", stopName: "Main St" } }),
    );
    expect(mockSchoolService.assignSchoolTransport).toHaveBeenCalledWith("org-1", "rt1", "s1", "Main St");
    expect(result).toEqual({ routeId: "rt1", studentId: "s1" });
  });

  it("both are denied without school.transport.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.transport_route", payload: { campusId: "c1", code: "R1", name: "Route 1", fee: 50 } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.transport_assignment", payload: { routeId: "rt1", studentId: "s1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.payroll_adjustment", () => {
  it("requires school.payroll.manage and calls createSchoolPayrollAdjustment", async () => {
    mockSchoolService.createSchoolPayrollAdjustment.mockResolvedValue({ id: "pa1", amount: "100.00" });
    const result = await applyOfflineMutation(
      tenant(["school.payroll.manage"]),
      mutation({ entityType: "school.payroll_adjustment", payload: { employeeId: "emp1", period: "2026-08", type: "BONUS", description: "Performance", amount: "100.00" } }),
    );
    expect(mockSchoolService.createSchoolPayrollAdjustment).toHaveBeenCalledWith("org-1", { employeeId: "emp1", period: "2026-08", type: "BONUS", description: "Performance", amount: "100.00" });
    expect(result).toEqual({ id: "pa1", amount: "100.00" });
  });

  it("is denied without school.payroll.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.payroll_adjustment", payload: { employeeId: "emp1", period: "2026-08", type: "BONUS", description: "Performance", amount: "100.00" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.settings", () => {
  it("UPDATE succeeds and calls upsertSchoolSettings when baseVersion matches the current server version", async () => {
    const updatedAt = new Date("2026-08-17T00:00:00.000Z");
    mockDb.schoolSettings.findFirst.mockResolvedValue({ updatedAt });
    mockSchoolService.upsertSchoolSettings.mockResolvedValue({ campusId: "c1", receiptPrefix: "SCH" });
    const result = await applyOfflineMutation(
      tenant(["school.settings.manage"]),
      mutation({ entityType: "school.settings", operation: "UPDATE", entityId: "c1", baseVersion: updatedAt.getTime(), payload: { attendanceCloseDays: 7, receiptPrefix: "SCH", allowRanking: true } }),
    );
    expect(mockSchoolService.upsertSchoolSettings).toHaveBeenCalledWith("org-1", { campusId: "c1", attendanceCloseDays: 7, receiptPrefix: "SCH", allowRanking: true, gradingScale: undefined });
    expect(result).toEqual({ campusId: "c1", receiptPrefix: "SCH" });
  });

  it("a campus with no settings row yet has version 0, not ENTITY_DELETED - never configured is not deleted", async () => {
    mockDb.schoolSettings.findFirst.mockResolvedValue(null);
    mockSchoolService.upsertSchoolSettings.mockResolvedValue({ campusId: "c1", receiptPrefix: "SCH" });
    const result = await applyOfflineMutation(
      tenant(["school.settings.manage"]),
      mutation({ entityType: "school.settings", operation: "UPDATE", entityId: "c1", baseVersion: 0, payload: { attendanceCloseDays: 7, receiptPrefix: "SCH", allowRanking: false } }),
    );
    expect(mockSchoolService.upsertSchoolSettings).toHaveBeenCalled();
    expect(result).toEqual({ campusId: "c1", receiptPrefix: "SCH" });
  });

  it("rejects a stale baseVersion as a conflict without calling upsertSchoolSettings, and reports the current cloud settings", async () => {
    const updatedAt = new Date("2026-08-17T00:00:00.000Z");
    mockDb.schoolSettings.findFirst.mockResolvedValue({ attendanceCloseDays: 14, receiptPrefix: "OLD", allowRanking: true, gradingScale: null, updatedAt });
    await expect(
      applyOfflineMutation(
        tenant(["school.settings.manage"]),
        mutation({ entityType: "school.settings", operation: "UPDATE", entityId: "c1", baseVersion: 1, payload: { attendanceCloseDays: 7, receiptPrefix: "SCH", allowRanking: false } }),
      ),
    ).rejects.toMatchObject({
      conflictType: "STALE_VERSION",
      cloudVersion: updatedAt.getTime(),
      cloudSnapshot: { attendanceCloseDays: 14, receiptPrefix: "OLD", allowRanking: true, gradingScale: null },
    });
    expect(mockSchoolService.upsertSchoolSettings).not.toHaveBeenCalled();
  });

  it("is denied without school.settings.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.settings", operation: "UPDATE", entityId: "c1", baseVersion: 0, payload: { attendanceCloseDays: 7, receiptPrefix: "SCH", allowRanking: false } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});
