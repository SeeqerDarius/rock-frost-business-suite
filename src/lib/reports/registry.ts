import "server-only";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAccountingSummary } from "@/modules/accounting/service";
import { getSchoolSummary } from "@/modules/school/service";
import { getHostelSummary } from "@/modules/hostel/service";
import { getHrSummary } from "@/modules/hr/service";
import { getPayrollSummary } from "@/modules/payroll/service";
import { getInventorySummary } from "@/modules/inventory/service";
import { getPosSummary } from "@/modules/pos/service";
import { getFleetSummary } from "@/modules/fleet/service";
import { getHotelSummary } from "@/modules/hotel/service";
import { getPharmacySummary } from "@/modules/pharmacy/service";
import { getHospitalSummary } from "@/modules/hospital/service";
import { getCrmSummary } from "@/modules/crm/service";
import { getInstallmentSummary } from "@/modules/installment/service";
import { getProcurementSummary } from "@/modules/procurement/service";
import { getProjectsSummary } from "@/modules/projects/service";

export interface ReportRegistryEntry {
  /** Matches the module's ModuleDefinition.key in src/platform/modules/registry.ts. */
  moduleKey: string;
  title: string;
  /** The *_REPORTS_VIEW permission gating this module's Reports page. */
  permission: string;
  getSummary: (organizationId: string) => Promise<Record<string, unknown>>;
}

/**
 * One entry per module with a Reports page. Each module's existing
 * getXSummary() already returns exactly the stats that page renders as
 * cards - see summaryToReportInput() for how that flat object becomes a
 * downloadable table. Deliberately does not include "analytics" (it's
 * already a cross-module report with no separate Reports subpage of its
 * own) or the organization-wide /app/reports overview.
 */
export const REPORT_REGISTRY: Record<string, ReportRegistryEntry> = {
  accounting: { moduleKey: "accounting", title: "Accounting report", permission: PERMISSIONS.ACCOUNTING_REPORTS_VIEW, getSummary: getAccountingSummary },
  school: { moduleKey: "school", title: "School report", permission: PERMISSIONS.SCHOOL_REPORTS_VIEW, getSummary: getSchoolSummary },
  hostel: { moduleKey: "hostel", title: "Hostel report", permission: PERMISSIONS.HOSTEL_REPORTS_VIEW, getSummary: getHostelSummary },
  hr: { moduleKey: "hr", title: "HR report", permission: PERMISSIONS.HR_REPORTS_VIEW, getSummary: getHrSummary },
  payroll: { moduleKey: "payroll", title: "Payroll report", permission: PERMISSIONS.PAYROLL_REPORTS_VIEW, getSummary: getPayrollSummary },
  inventory: { moduleKey: "inventory", title: "Inventory report", permission: PERMISSIONS.INVENTORY_REPORTS_VIEW, getSummary: getInventorySummary },
  pos: { moduleKey: "pos", title: "Point of Sale report", permission: PERMISSIONS.POS_REPORTS_VIEW, getSummary: getPosSummary },
  fleet: { moduleKey: "fleet", title: "Fleet report", permission: PERMISSIONS.FLEET_REPORTS_VIEW, getSummary: getFleetSummary },
  hotel: { moduleKey: "hotel", title: "Hotel report", permission: PERMISSIONS.HOTEL_REPORTS_VIEW, getSummary: getHotelSummary },
  pharmacy: { moduleKey: "pharmacy", title: "Pharmacy report", permission: PERMISSIONS.PHARMACY_REPORTS_VIEW, getSummary: async (organizationId) => getPharmacySummary(organizationId) },
  hospital: { moduleKey: "hospital", title: "Hospital report", permission: PERMISSIONS.HOSPITAL_REPORTS_VIEW, getSummary: getHospitalSummary },
  crm: { moduleKey: "crm", title: "CRM report", permission: PERMISSIONS.CRM_REPORTS_VIEW, getSummary: getCrmSummary },
  installment: { moduleKey: "installment", title: "Installment report", permission: PERMISSIONS.HIREPURCHASE_REPORTS_VIEW, getSummary: getInstallmentSummary },
  procurement: { moduleKey: "procurement", title: "Procurement report", permission: PERMISSIONS.PROCUREMENT_REPORTS_VIEW, getSummary: getProcurementSummary },
  projects: { moduleKey: "projects", title: "Projects report", permission: PERMISSIONS.PROJECTS_REPORTS_VIEW, getSummary: getProjectsSummary },
};
