import type { Metadata } from "next";

export const SITE_URL = "https://www.rockfrostgroup.com";
export const SITE_NAME = "Rock Frost Business Suite";
export const COMPANY_NAME = "Rock Frost Technologies";
export const DEFAULT_DESCRIPTION =
  "Modular business management software for organizations in Ghana and Africa. Manage fleet, installment sales, CRM, inventory, accounting, HR, payroll, POS, procurement, projects, and analytics in one secure platform.";

export function createPublicMetadata({
  title,
  description,
  path,
  keywords = [],
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
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
    shortName: "Fleet Management Software",
    description:
      "Manage vehicles, drivers, owners, maintenance, insurance, payments, and work-and-pay contracts with secure fleet management software.",
    keywords: ["fleet management software Ghana", "vehicle management system", "transport management software Africa"],
    features: ["Vehicle and driver records", "Maintenance approval workflows", "Insurance and roadworthy tracking", "Owner payouts and work-and-pay contracts"],
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
    shortName: "Inventory Management Software",
    description:
      "Track stock, warehouses, transfers, adjustments, and inventory movement history across your organization.",
    keywords: ["inventory management software Ghana", "warehouse management system", "stock control software Africa"],
    features: ["Multi-warehouse stock control", "Transfers and adjustments", "Inventory movement history", "Low-stock visibility and reports"],
  },
  accounting: {
    shortName: "Accounting Software",
    description:
      "Manage ledgers, invoices, expenses, journal entries, and financial statements with organization-scoped accounting software.",
    keywords: ["accounting software Ghana", "business accounting system Africa", "invoice and expense software"],
    features: ["Chart of accounts and ledgers", "Invoices and payment tracking", "Expense management", "Financial statements and reports"],
  },
  hr: {
    shortName: "Human Resources Management Software",
    description:
      "Manage employee records, onboarding, leave, reviews, and workforce reports with secure HR management software.",
    keywords: ["HR software Ghana", "human resource management system Africa", "employee leave management"],
    features: ["Employee profiles and onboarding", "Leave requests and approvals", "Performance reviews", "Workforce reporting"],
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
    shortName: "Hotel Management Software",
    description: "Manage properties, rooms, guests, reservations, check-in and checkout, folios, housekeeping, restaurant operations, and distribution channels.",
    keywords: ["hotel management software Ghana", "property management system Africa", "hotel reservation and housekeeping software"],
    features: ["Rooms, guests, and reservations", "Check-in, checkout, folios, and payments", "Housekeeping and room readiness", "Restaurant operations and channel mappings"],
  },
  school: {
    shortName: "School Management Software",
    description: "Manage students, guardians, academics, attendance, fees, examinations, timetables, transport, library, and school payroll inputs.",
    keywords: ["school management software Ghana", "student information system Africa", "school fees attendance examination software"],
    features: ["Student, guardian, and enrollment records", "Attendance, fees, and payments", "Examinations, grading, and timetables", "Transport, library, and payroll inputs"],
  },
} as const;
