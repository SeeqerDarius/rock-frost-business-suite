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

export interface SchoolExamPayload extends Record<string, unknown> {
  academicYearId: string;
  termId: string;
  subjectId: string;
  name: string;
  totalMarks: string;
  weight: string;
  examDate?: string | null;
}

export interface SchoolExamResultPayload extends Record<string, unknown> {
  examId: string;
  studentId: string;
  classId: string;
  subjectId: string;
  marks: number;
  grade?: string | null;
  remark?: string | null;
}

export interface SchoolExamModerationSubmitPayload extends Record<string, unknown> {
  examId: string;
}

export interface SchoolExamPublishPayload extends Record<string, unknown> {
  examId: string;
}

export interface SchoolExamResultRecord extends Record<string, unknown> {
  id: string;
  studentId: string;
  classId: string;
  subjectId: string;
  marks: string;
  grade: string | null;
  remark: string | null;
  moderatedAt: string | null;
  publishedAt: string | null;
}

/** Shape of a pulled `school.exam` row's payload - embeds its results directly (mirrors `school.fee_invoice_record`'s embedded payments), since there is no bulk, exam-independent way to create a result. */
export interface SchoolExamRecord extends Record<string, unknown> {
  academicYearId: string;
  termId: string;
  subjectId: string;
  name: string;
  totalMarks: string;
  weight: string;
  status: "DRAFT" | "OPEN" | "MODERATION" | "PUBLISHED";
  examDate: string | null;
  publishedAt: string | null;
  results: SchoolExamResultRecord[];
}

export interface SchoolTimetableEntryPayload extends Record<string, unknown> {
  campusId: string;
  termId: string;
  classId: string;
  subjectId: string;
  teacherName: string;
  room?: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

/** Shape of a pulled `school.timetable_entry` row's payload. */
export interface SchoolTimetableEntryRecord extends Record<string, unknown> {
  campusId: string;
  termId: string;
  classId: string;
  subjectId: string;
  teacherName: string;
  room: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  publishedAt: string | null;
}

export interface SchoolLibraryBookPayload extends Record<string, unknown> {
  accessionCode: string;
  isbn?: string | null;
  title: string;
  author?: string | null;
  category?: string | null;
  totalCopies: number;
}

/** Shape of a pulled `school.library_book` row's payload. */
export interface SchoolLibraryBookRecord extends Record<string, unknown> {
  accessionCode: string;
  isbn: string | null;
  title: string;
  author: string | null;
  category: string | null;
  totalCopies: number;
  availableCopies: number;
  active: boolean;
}

export interface SchoolLibraryLoanPayload extends Record<string, unknown> {
  bookId: string;
  studentId: string;
  dueAt: string;
}

export interface SchoolLibraryLoanReturnPayload extends Record<string, unknown> {
  loanId: string;
}

/** Shape of a pulled `school.library_loan` row's payload. */
export interface SchoolLibraryLoanRecord extends Record<string, unknown> {
  bookId: string;
  studentId: string;
  status: "BORROWED" | "RETURNED" | "OVERDUE";
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  fineAmount: string;
}

export interface SchoolTransportRoutePayload extends Record<string, unknown> {
  campusId: string;
  code: string;
  name: string;
  vehicle?: string | null;
  driverName?: string | null;
  stops?: string[];
  fee: number;
}

/** Shape of a pulled `school.transport_route` row's payload. */
export interface SchoolTransportRouteRecord extends Record<string, unknown> {
  campusId: string;
  code: string;
  name: string;
  vehicle: string | null;
  driverName: string | null;
  stops: string[] | null;
  fee: string;
  active: boolean;
}

export interface SchoolTransportAssignmentPayload extends Record<string, unknown> {
  routeId: string;
  studentId: string;
  stopName?: string | null;
}

/** Shape of a pulled `school.transport_assignment` row's payload. */
export interface SchoolTransportAssignmentRecord extends Record<string, unknown> {
  routeId: string;
  studentId: string;
  stopName: string | null;
  active: boolean;
}

export interface SchoolPayrollAdjustmentPayload extends Record<string, unknown> {
  employeeId: string;
  period: string;
  type: string;
  description: string;
  amount: string;
}

/** Shape of a pulled `school.payroll_adjustment` row's payload. */
export interface SchoolPayrollAdjustmentRecord extends Record<string, unknown> {
  employeeId: string;
  period: string;
  type: string;
  description: string;
  amount: string;
  processedAt: string | null;
  createdAt: string;
}

export interface SchoolGradingScaleBand extends Record<string, unknown> {
  grade: string;
  min: number;
  max: number;
}

export interface SchoolSettingsPayload extends Record<string, unknown> {
  attendanceCloseDays: number;
  receiptPrefix: string;
  allowRanking: boolean;
  gradingScale?: SchoolGradingScaleBand[] | null;
}

/** Shape of a pulled `school.settings` row's payload - entityId is the campus's own id, see school.adapters.ts server-side. */
export interface SchoolSettingsRecord extends Record<string, unknown> {
  gradingScale: SchoolGradingScaleBand[] | null;
  attendanceCloseDays: number;
  receiptPrefix: string;
  allowRanking: boolean;
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
  EXAM: "school.exam",
  EXAM_RESULT: "school.exam_result",
  EXAM_MODERATION_SUBMIT: "school.exam_moderation_submit",
  EXAM_PUBLISH: "school.exam_publish",
  TIMETABLE_ENTRY: "school.timetable_entry",
  LIBRARY_BOOK: "school.library_book",
  LIBRARY_LOAN: "school.library_loan",
  LIBRARY_LOAN_RETURN: "school.library_loan_return",
  TRANSPORT_ROUTE: "school.transport_route",
  TRANSPORT_ASSIGNMENT: "school.transport_assignment",
  PAYROLL_ADJUSTMENT: "school.payroll_adjustment",
  SETTINGS: "school.settings",
} as const;
