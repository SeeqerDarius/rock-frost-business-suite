import { Badge } from "@/components/ui/badge";
import { humanizeStatus } from "./format";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Single source of truth for how a School record status is coloured.
 *
 * Covers every status enum surfaced in the School UI: student lifecycle,
 * attendance, fee invoice, exam workflow, and library loan.
 */
const VARIANTS: Record<string, BadgeVariant> = {
  // Student lifecycle
  APPLICANT: "outline",
  ACTIVE: "default",
  SUSPENDED: "destructive",
  WITHDRAWN: "outline",
  GRADUATED: "secondary",
  // Attendance
  PRESENT: "default",
  ABSENT: "destructive",
  LATE: "secondary",
  EXCUSED: "outline",
  // Fee invoices
  ISSUED: "secondary",
  PART_PAID: "secondary",
  PAID: "default",
  CANCELLED: "outline",
  // Exams
  DRAFT: "outline",
  OPEN: "secondary",
  MODERATION: "secondary",
  PUBLISHED: "default",
  // Library loans
  BORROWED: "secondary",
  OVERDUE: "destructive",
  RETURNED: "default",
  LOST: "destructive",
  DAMAGED: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANTS[status] ?? "outline"}>{humanizeStatus(status)}</Badge>;
}
