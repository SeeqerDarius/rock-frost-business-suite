export interface SchoolCampusPayload extends Record<string, unknown> {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SchoolAcademicYearPayload extends Record<string, unknown> {
  name: string;
  startDate: string;
  endDate: string;
  current?: boolean;
}

export interface SchoolTermPayload extends Record<string, unknown> {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  current?: boolean;
}

/** Shape of a pulled `school.campus` row's payload (see buildSchoolSnapshot server-side). */
export interface SchoolCampusRecord extends Record<string, unknown> {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
}

/** Shape of a pulled `school.academic_year` row's payload. */
export interface SchoolAcademicYearRecord extends Record<string, unknown> {
  name: string;
  startDate: string;
  endDate: string;
  current: boolean;
  closedAt: string | null;
}

/** Shape of a pulled `school.term` row's payload. */
export interface SchoolTermRecord extends Record<string, unknown> {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  current: boolean;
  closedAt: string | null;
}

export type SchoolStudentStatus = "APPLICANT" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN" | "GRADUATED";

export interface SchoolStudentPayload extends Record<string, unknown> {
  campusId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  admissionDate?: string | null;
  medicalNotes?: string | null;
}

export interface SchoolStudentStatusTransitionPayload extends Record<string, unknown> {
  toStatus: SchoolStudentStatus;
  reason?: string | null;
}

export interface SchoolGuardianPayload extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  address?: string | null;
  occupation?: string | null;
}

export interface SchoolGuardianLinkPayload extends Record<string, unknown> {
  studentId: string;
  guardianId: string;
  relationship: string;
  primary: boolean;
}

export interface SchoolClassPayload extends Record<string, unknown> {
  campusId: string;
  code: string;
  name: string;
  gradeLevel?: string | null;
  capacity?: number | null;
}

export interface SchoolSubjectPayload extends Record<string, unknown> {
  code: string;
  name: string;
  description?: string | null;
}

export interface SchoolEnrollmentPayload extends Record<string, unknown> {
  campusId: string;
  academicYearId: string;
  studentId: string;
  classId: string;
}

export interface SchoolAttendancePayload extends Record<string, unknown> {
  termId: string;
  classId: string;
  studentId: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  reason?: string | null;
}

/** Shape of a pulled `school.student` row's payload. */
export interface SchoolStudentRecord extends Record<string, unknown> {
  campusId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  status: SchoolStudentStatus;
  admissionDate: string | null;
  medicalNotes: string | null;
}

/** Shape of a pulled `school.guardian` row's payload. */
export interface SchoolGuardianRecord extends Record<string, unknown> {
  guardianNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  address: string | null;
  occupation: string | null;
}

/** Shape of a pulled `school.guardian_link` row's payload. */
export interface SchoolGuardianLinkRecord extends Record<string, unknown> {
  studentId: string;
  guardianId: string;
  relationship: string;
  primary: boolean;
  authorizedPickup: boolean;
}

/** Shape of a pulled `school.class` row's payload. */
export interface SchoolClassRecord extends Record<string, unknown> {
  campusId: string;
  code: string;
  name: string;
  gradeLevel: string | null;
  capacity: number | null;
}

/** Shape of a pulled `school.subject` row's payload. */
export interface SchoolSubjectRecord extends Record<string, unknown> {
  code: string;
  name: string;
  description: string | null;
}

/** Shape of a pulled `school.enrollment` row's payload. Only ACTIVE enrollments are pulled - see buildSchoolSnapshot server-side. */
export interface SchoolEnrollmentRecord extends Record<string, unknown> {
  campusId: string;
  academicYearId: string;
  studentId: string;
  classId: string;
  status: "ACTIVE" | "COMPLETED" | "WITHDRAWN";
  enrolledAt: string;
  endedAt: string | null;
}

/** Shape of a pulled `school.attendance` row's payload. */
export interface SchoolAttendanceRecord extends Record<string, unknown> {
  termId: string;
  classId: string;
  studentId: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  reason: string | null;
}

export interface SchoolFeeInvoicePayload extends Record<string, unknown> {
  academicYearId: string;
  termId?: string | null;
  studentId: string;
  description: string;
  amount: string;
  discount?: number;
  dueDate?: string | null;
}

export interface SchoolFeePaymentPayload extends Record<string, unknown> {
  invoiceId: string;
  amount: string;
  method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ONLINE" | "OTHER";
  reference?: string | null;
}

export interface SchoolFeeStructurePayload extends Record<string, unknown> {
  campusId: string;
  academicYearId: string;
  termId?: string | null;
  classId?: string | null;
  name: string;
  description?: string | null;
  amount: string;
  dueDate?: string | null;
}

export interface SchoolFeeStructureIssuancePayload extends Record<string, unknown> {
  feeStructureId: string;
}

export interface SchoolFeePaymentRecord extends Record<string, unknown> {
  id: string;
  amount: string;
  method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ONLINE" | "OTHER";
  reference: string | null;
  receivedAt: string;
  refundedAt: string | null;
}

/** Shape of a pulled `school.fee_invoice_record` row's payload - embeds its payments directly (mirrors pos.sale_record's embedded `lines`), so the desktop never needs a separate per-payment cache read to compute an outstanding balance. */
export interface SchoolFeeInvoiceRecord extends Record<string, unknown> {
  academicYearId: string;
  termId: string | null;
  studentId: string;
  feeStructureId: string | null;
  invoiceNumber: string;
  description: string;
  amount: string;
  discount: string;
  status: "DRAFT" | "ISSUED" | "PART_PAID" | "PAID" | "VOID";
  dueDate: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  payments: SchoolFeePaymentRecord[];
}

/** Shape of a pulled `school.fee_structure` row's payload. */
export interface SchoolFeeStructureRecord extends Record<string, unknown> {
  campusId: string;
  academicYearId: string;
  termId: string | null;
  classId: string | null;
  name: string;
  description: string | null;
  amount: string;
  dueDate: string | null;
  active: boolean;
}

export const SCHOOL_ENTITY_TYPES = {
  CAMPUS: "school.campus",
  ACADEMIC_YEAR: "school.academic_year",
  TERM: "school.term",
  STUDENT: "school.student",
  STUDENT_STATUS_TRANSITION: "school.student_status_transition",
  GUARDIAN: "school.guardian",
  GUARDIAN_LINK: "school.guardian_link",
  CLASS: "school.class",
  SUBJECT: "school.subject",
  ENROLLMENT: "school.enrollment",
  ATTENDANCE: "school.attendance",
  FEE_INVOICE: "school.fee_invoice",
  FEE_PAYMENT: "school.fee_payment",
  FEE_STRUCTURE: "school.fee_structure",
  FEE_STRUCTURE_ISSUANCE: "school.fee_structure_issuance",
  FEE_INVOICE_RECORD: "school.fee_invoice_record",
} as const;
