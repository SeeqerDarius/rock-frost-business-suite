export interface RoleGuide {
  summary: string;
  steps: string[];
}

const GUIDES: Record<string, RoleGuide> = {
  "Organization Owner": {
    summary: "You are responsible for the organization, subscriptions, access, settings, and oversight across enabled modules.",
    steps: ["Use Administration to invite people and assign only the access they need.", "Review Billing and Organization Settings before operational work begins.", "Use Reports to monitor performance, then open each module to review exceptions and approvals."],
  },
  "Organization Admin": {
    summary: "You coordinate day-to-day work across enabled modules and manage staff access, but billing and owner-only settings remain with the organization owner.",
    steps: ["Use Administration to invite staff, update roles, and remove access when duties change.", "Open each enabled module from the grid icon and review pending operational work.", "Escalate subscription, billing, backup, and owner-only setting changes to the organization owner."],
  },
  "School Administrator": {
    summary: "You run the school's complete operational workspace and keep academic, student, finance, and service records accurate.",
    steps: ["Set up campuses, academic periods, classes, and subjects before admitting students.", "Use Students & Guardians to admit a student and primary guardian together, then enroll the student in a class.", "Review attendance, exams, fees, library, transport, payroll, and reports regularly. Assign teachers only to the classes they should manage."],
  },
  "Admissions Officer": {
    summary: "You maintain student admissions, guardian contacts, and class enrollment records.",
    steps: ["Open Students & Guardians and use Admit student to save the student and primary guardian in one submission.", "Search existing guardians before creating another record, and keep phone and contact details current.", "Open Classes & Enrollment to place each admitted student in the correct class and academic year."],
  },
  Teacher: {
    summary: "You record attendance, assessments, and timetable information for the classes assigned to you.",
    steps: ["Open Attendance, choose your assigned class and date, mark the roster, review the totals, then save.", "Use Exams & Grading to enter results carefully and check every mark before submission.", "Use Timetables to confirm lessons and report missing class access to the school administrator."],
  },
  "Academic Head": {
    summary: "You manage academic periods, assessment quality, grading, and publication of approved results.",
    steps: ["Confirm academic years, terms, classes, subjects, and teacher assignments.", "Review submitted assessment results for accuracy before moderation or publication.", "Use School Reports to compare attendance and academic trends, then follow up on exceptions."],
  },
  Bursar: {
    summary: "You manage school fees, receipts, finance reporting, and approved payroll inputs.",
    steps: ["Create fee structures and issue charges to the correct students and academic period.", "Record each payment against its invoice and verify the receipt and outstanding balance.", "Reconcile School Reports with Accounting and investigate overdue or unusual balances."],
  },
  Librarian: {
    summary: "You keep the school library catalogue and circulation records accurate.",
    steps: ["Add each book with the correct accession information and available copy count.", "Record every borrowing and return against the correct student.", "Review overdue and unavailable items regularly and correct discrepancies promptly."],
  },
  "Transport Manager": {
    summary: "You maintain school routes and assign students to the correct transport service.",
    steps: ["Create and update routes with accurate operational details.", "Assign students to the correct route and remove outdated assignments.", "Review transport records before each term and follow up on missing information."],
  },
};

export function getRoleQuickGuide(role: string | null, accessibleModuleKeys: string[]): RoleGuide {
  if (role && GUIDES[role]) return GUIDES[role];
  const modules = accessibleModuleKeys.length > 0 ? accessibleModuleKeys.join(", ") : "the areas your administrator assigned";
  return {
    summary: `Your ${role ?? "member"} role gives you access to ${modules}. Use only the records required for your assigned duties.`,
    steps: ["Use the grid icon in the header to open an available module.", "Use the left navigation to move between tasks, and review form feedback before leaving a page.", "Ask an organization administrator if a required page is missing or your responsibilities change."],
  };
}
