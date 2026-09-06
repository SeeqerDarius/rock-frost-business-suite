import type { Metadata } from "next";

export const SITE_URL = "https://www.rockfrostgroup.com";
export const SITE_NAME = "Rock Frost Business Suite";
export const COMPANY_NAME = "Rock Frost Technologies";
export const DEFAULT_DESCRIPTION =
  "Run finance, fleet, sales, people, stock and industry operations with secure, modular business management software built for Ghanaian organizations.";

type ModuleSeoContent = {
  audience: string;
  outcomes: readonly { title: string; description: string }[];
  workflows: readonly string[];
  faqs: readonly { question: string; answer: string }[];
};

type ModuleSeoEntry = {
  shortName: string;
  description: string;
  keywords: readonly string[];
  features: readonly string[];
  content?: ModuleSeoContent;
};

export function createPublicMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  /** For a real page that must stay reachable (a post-submit confirmation, a
   * checkout step) but shouldn't be indexed or ranked, as opposed to a page
   * that shouldn't exist for crawlers at all, which belongs in robots.ts instead. */
  noIndex?: boolean;
}): Metadata {
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "website",
      locale: "en_GH",
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export const MODULE_SEO = {
  fleet: {
    shortName: "Fleet Management Software Ghana",
    description:
      "Manage vehicles, drivers, owners, maintenance, insurance, payments, and work-and-pay contracts with secure fleet management software.",
    keywords: ["fleet management software Ghana", "vehicle management system", "transport management software Africa"],
    features: ["Vehicle and driver records", "Maintenance approval workflows", "Insurance and roadworthy tracking", "Owner payouts and work-and-pay contracts"],
    content: {
      audience: "Built for transport operators, vehicle owners, logistics teams, and organizations that need one reliable view of vehicles, drivers, compliance, maintenance, and fleet-related payments.",
      outcomes: [
        { title: "Control vehicle operations", description: "Keep vehicle, driver, owner, insurance, and roadworthy information together so the team can act from consistent records." },
        { title: "Make maintenance accountable", description: "Raise maintenance requests, review costs, record approvals, and connect payments to the work that created them." },
        { title: "Track commercial agreements", description: "Manage owner payouts and work-and-pay arrangements with clear periods, payment history, and organization-scoped access." },
      ],
      workflows: ["Register vehicles, owners, and assigned drivers", "Monitor insurance and roadworthy dates", "Request, approve, and complete maintenance", "Record fleet payments against the correct operational source", "Review driver sales and work-and-pay performance"],
      faqs: [
        { question: "Who is Rock Frost Fleet Management for?", answer: "It is designed for Ghanaian transport operators, logistics businesses, vehicle owners, and multi-vehicle organizations that need controlled operational and financial records." },
        { question: "Can fleet payments connect to accounting?", answer: "Yes. Confirmed fleet activity can connect to the Accounting module while permissions keep operational and financial responsibilities separated." },
        { question: "Does it support work-and-pay vehicles?", answer: "Yes. The module supports work-and-pay contracts, driver-linked activity, payment periods, and owner or stakeholder visibility." },
      ],
    },
  },
  installment: {
    shortName: "Installment Sales Management Software",
    description:
      "Manage installment sales, customer accounts, collections, products, staff inventory, payroll, credits, and payment history in one system.",
    keywords: ["installment management system Ghana", "hire purchase software", "installment sales software Africa"],
    features: ["Customer installment accounts", "Collection and payment tracking", "Staff inventory and performance", "Credits, refunds, and account lifecycle"],
  },
  crm: {
    shortName: "CRM Software",
    description:
      "Organize leads, contacts, deals, activities, and customer communication with secure CRM software for growing organizations.",
    keywords: ["CRM software Ghana", "customer relationship management Africa", "sales pipeline software"],
    features: ["Lead and contact management", "Deal pipeline tracking", "Customer activity history", "Sales performance reports"],
  },
  inventory: {
    shortName: "Inventory Management Software Ghana",
    description:
      "Control stock, warehouses, suppliers, purchase approvals, orders, receiving, and replenishment from one connected workspace.",
    keywords: ["inventory management software Ghana", "procurement software Ghana", "warehouse management system", "stock control software Africa"],
    features: ["Multi-warehouse stock control", "Supplier and purchase management", "Approval and receiving workflows", "Low-stock visibility and replenishment"],
    content: {
      audience: "Designed for retailers, distributors, warehouses, procurement teams, and growing Ghanaian businesses that need dependable stock and purchasing controls across locations.",
      outcomes: [
        { title: "Know what stock is available", description: "See quantities by warehouse and keep stock movement tied to recorded business activity." },
        { title: "Control purchasing", description: "Move from supplier and purchase requests through approval, ordering, and receiving with a traceable workflow." },
        { title: "Reduce avoidable shortages", description: "Use low-stock visibility and replenishment information to identify products that need attention." },
      ],
      workflows: ["Create warehouses and organize stock", "Maintain supplier and product records", "Submit and approve purchase requests", "Receive purchase orders into the correct location", "Review stock levels and replenishment needs"],
      faqs: [
        { question: "Can Rock Frost manage more than one warehouse?", answer: "Yes. Inventory records and stock controls support multiple warehouses within the same organization." },
        { question: "Does the system include procurement approvals?", answer: "Yes. Teams can manage purchase requests, approvals, orders, suppliers, and receiving in a connected process." },
        { question: "Can inventory connect to other modules?", answer: "Yes. Inventory and Procurement can operate independently or connect with relevant sales, point-of-sale, pharmacy, and accounting workflows." },
      ],
    },
  },
  accounting: {
    shortName: "Accounting Software",
    description:
      "Manage ledgers, invoices, expenses, journal entries, and financial statements with organization-scoped accounting software.",
    keywords: ["accounting software Ghana", "business accounting system Africa", "invoice and expense software"],
    features: ["Chart of accounts and ledgers", "Invoices and payment tracking", "Expense management", "Financial statements and reports"],
  },
  hr: {
    shortName: "HR and Payroll Software Ghana",
    description:
      "Manage employee records, onboarding, leave, reviews, compensation, payroll runs, payslips, and workforce reporting in one secure system.",
    keywords: ["HR and payroll software Ghana", "human resource management system Africa", "employee leave management", "payroll software Ghana"],
    features: ["Employee profiles and onboarding", "Leave and performance workflows", "Compensation and payroll runs", "Payslips and workforce reporting"],
    content: {
      audience: "Built for Ghanaian employers that want employee records, onboarding, leave, performance, compensation, payroll runs, and payslips in one permission-controlled workspace.",
      outcomes: [
        { title: "Create a reliable employee record", description: "Keep employment information, organizational assignments, skills, onboarding, and status history in one structured profile." },
        { title: "Standardize people workflows", description: "Manage leave, reviews, onboarding plans, and offboarding activities with visible ownership and status." },
        { title: "Run payroll with clearer controls", description: "Maintain compensation, process salary runs, apply configured deductions, and produce payslips and payroll reports." },
      ],
      workflows: ["Onboard employees and maintain their profiles", "Configure departments, positions, leave types, and HR settings", "Submit and review leave requests", "Manage reviews, skills, and employee lifecycle activities", "Prepare payroll runs and issue payslips"],
      faqs: [
        { question: "Are HR and payroll connected?", answer: "Yes. Rock Frost combines employee and compensation records with payroll processing so authorized teams work from consistent information." },
        { question: "Can employees receive payslips?", answer: "Yes. Authorized payroll users can process payroll and generate employee payslips from recorded compensation and payroll settings." },
        { question: "Does every user see payroll information?", answer: "No. Organization roles and module permissions control who can access employee, compensation, payroll, and reporting information." },
      ],
    },
  },
  payroll: {
    shortName: "Payroll Management Software",
    description:
      "Run payroll, manage compensation and deductions, and generate payslips with accurate organization-level payroll controls.",
    keywords: ["payroll software Ghana", "salary management system Africa", "employee payslip software"],
    features: ["Compensation management", "Payroll processing", "Deductions and tax settings", "Payslips and payroll reports"],
  },
  procurement: {
    shortName: "Procurement Management Software",
    description:
      "Control vendors, purchase requests, approvals, orders, and procurement reporting from one secure workspace.",
    keywords: ["procurement software Ghana", "purchase order system Africa", "vendor management software"],
    features: ["Vendor management", "Purchase requests and approvals", "Purchase orders", "Procurement reports and settings"],
  },
  projects: {
    shortName: "Project Management Software",
    description:
      "Plan projects, assign tasks, monitor milestones, and understand team workload with integrated project management software.",
    keywords: ["project management software Ghana", "task management system Africa", "project milestone tracking"],
    features: ["Project planning", "Task ownership and status", "Milestone tracking", "Team workload reports"],
  },
  analytics: {
    shortName: "Business Analytics Software",
    description:
      "View financial, sales, operations, and people insights across enabled business modules with secure business analytics.",
    keywords: ["business analytics software Ghana", "business intelligence Africa", "operations dashboard software"],
    features: ["Financial analytics", "Sales performance", "Operational reporting", "People and workforce insights"],
  },
  pos: {
    shortName: "Point of Sale Software",
    description:
      "Run registers, checkout, daily sales, inventory-linked transactions, and retail reports with modern point-of-sale software.",
    keywords: ["POS software Ghana", "point of sale system Africa", "retail checkout software"],
    features: ["Register and session controls", "Fast retail checkout", "Sales history", "POS settings and reports"],
  },
  hotel: {
    shortName: "Hotel Management Software Ghana",
    description: "Manage hotel rooms, reservations, guests, check-in, folios, housekeeping, restaurant operations and channel mappings in one secure system.",
    keywords: ["hotel management software Ghana", "property management system Africa", "hotel reservation and housekeeping software"],
    features: ["Rooms, guests, and reservations", "Check-in, checkout, folios, and payments", "Housekeeping and room readiness", "Restaurant operations and channel mappings"],
    content: {
      audience: "Designed for hotels, guest houses, lodges, and hospitality groups in Ghana that need front-desk, housekeeping, guest, restaurant, and payment workflows in one system.",
      outcomes: [
        { title: "Give the front desk one operating view", description: "Manage guests, room availability, reservations, arrivals, stays, folios, and departures from connected records." },
        { title: "Coordinate room readiness", description: "Keep housekeeping status visible so front-desk and operations teams can prepare rooms for arriving guests." },
        { title: "Connect guest charges", description: "Record accommodation and restaurant activity against the appropriate folio for clearer settlement and reporting." },
      ],
      workflows: ["Configure properties, room types, rooms, and rates", "Create guest profiles and reservations", "Check guests in and manage their stay", "Update housekeeping and room readiness", "Post folio charges, receive payments, and check guests out", "Manage restaurant orders and distribution channel mappings"],
      faqs: [
        { question: "What types of properties can use Rock Frost Hotel Management?", answer: "The module is suited to hotels, guest houses, lodges, and hospitality groups that need structured reservation and property operations." },
        { question: "Does it include housekeeping?", answer: "Yes. Teams can manage room readiness and housekeeping activity alongside reservations and guest stays." },
        { question: "Can restaurant charges be connected to a guest stay?", answer: "Yes. Hotel restaurant activity and guest folios are part of the connected operational workflow." },
      ],
    },
  },
  school: {
    shortName: "School Management Software Ghana",
    description: "Manage admissions, students, guardians, attendance, fees, examinations, timetables, transport, library and school operations securely.",
    keywords: ["school management software Ghana", "student information system Africa", "school fees attendance examination software"],
    features: ["Student, guardian, and enrollment records", "Attendance, fees, and payments", "Examinations, grading, and timetables", "Transport, library, and payroll inputs"],
    content: {
      audience: "Built for Ghanaian basic schools, senior high schools, and education groups that need connected academic, financial, administrative, and campus-service records.",
      outcomes: [
        { title: "Keep the student journey connected", description: "Manage admissions, student and guardian records, enrollment, classes, and status changes from a consistent source." },
        { title: "Bring academics and attendance together", description: "Record attendance, examinations, grading, subjects, and timetables within the same school workspace." },
        { title: "Improve fee visibility", description: "Create fee structures, invoices, payments, and receipts while retaining the records needed for follow-up and reporting." },
      ],
      workflows: ["Configure campuses, academic years, terms, classes, and subjects", "Register applicants, students, guardians, and enrollments", "Take attendance and maintain timetables", "Record examinations and calculate results", "Create school fees, receive payments, and issue receipts", "Manage transport, library, and connected hostel operations"],
      faqs: [
        { question: "Which schools can use Rock Frost School Management?", answer: "The module supports basic schools, senior high schools, and multi-campus education organizations that need controlled academic and administrative workflows." },
        { question: "Does it manage school fees and receipts?", answer: "Yes. Authorized staff can configure fees, create invoices, record payments, and issue receipts." },
        { question: "Can boarding operations be included?", answer: "Yes. Schools can add the Hostel Management module for buildings, rooms, beds, allocations, wardens, and hostel fee billing." },
      ],
    },
  },
  hostel: {
    shortName: "Hostel Management Software",
    description: "Manage boarding hostel buildings, rooms and beds, student allocations, wardens, and hostel fee billing for schools with residential facilities.",
    keywords: ["hostel management software Ghana", "school boarding house system Africa", "student bed allocation and hostel fees software"],
    features: ["Buildings, rooms, and bed capacity", "Student bed allocations tied to School records", "Warden assignments per building", "Hostel fee structures, invoices, and payments"],
  },
  pharmacy: {
    shortName: "Pharmacy Management Software",
    description: "Manage medicines, batch and expiry stock, prescriptions, dispensing, restricted-medicine records, patients, suppliers, and pharmacy reports.",
    keywords: ["pharmacy management software Ghana", "pharmacy dispensing system Africa", "medicine batch expiry software"],
    features: ["Medicine and supplier records", "Batch, expiry, quarantine, and recall traceability", "Prescription-aware FEFO dispensing", "Restricted-medicine register and pharmacy reports"],
  },
  hospital: {
    shortName: "Hospital Management Software",
    description: "Manage patient records, appointments, encounters, admissions and beds, laboratory, imaging, medication orders, billing, nursing workflows, referrals, and consent.",
    keywords: ["hospital management software Ghana", "hospital information system Africa", "patient encounter laboratory billing software"],
    features: ["Patients, appointments, and clinical encounters", "Admissions, wards, beds, and nursing workflows", "Laboratory and imaging with verified-result history", "Medication orders, billing, insurance claims, referrals, and consent"],
  },
} as const satisfies Record<string, ModuleSeoEntry>;
