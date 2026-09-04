import type { BusinessModuleKey } from "@/platform/modules/registry";
import { PERMISSIONS } from "@/lib/auth/permissions";

export type ModuleTeamKey = Exclude<BusinessModuleKey, "fleet" | "installment" | "hr" | "school" | "hostel">;

export type ModuleTeamConfig = {
  key: ModuleTeamKey;
  label: string;
  roleNames: readonly string[];
  managePermission: string;
};

export const MODULE_TEAM_CONFIGS: Record<ModuleTeamKey, ModuleTeamConfig> = {
  crm: { key: "crm", label: "CRM", roleNames: ["CRM Manager"], managePermission: PERMISSIONS.CRM_SETTINGS_MANAGE },
  inventory: { key: "inventory", label: "Inventory", roleNames: ["Inventory Manager"], managePermission: PERMISSIONS.INVENTORY_SETTINGS_MANAGE },
  accounting: { key: "accounting", label: "Accounting", roleNames: ["Accounting Manager"], managePermission: PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE },
  payroll: { key: "payroll", label: "Payroll", roleNames: ["Payroll Manager"], managePermission: PERMISSIONS.PAYROLL_SETTINGS_MANAGE },
  procurement: { key: "procurement", label: "Procurement", roleNames: ["Procurement Manager"], managePermission: PERMISSIONS.PROCUREMENT_SETTINGS_MANAGE },
  analytics: { key: "analytics", label: "Analytics", roleNames: ["Analytics Manager"], managePermission: PERMISSIONS.ANALYTICS_SETTINGS_MANAGE },
  pos: { key: "pos", label: "Point of Sale", roleNames: ["POS Cashier"], managePermission: PERMISSIONS.ORG_MEMBERS_MANAGE },
  projects: { key: "projects", label: "Projects", roleNames: ["Projects Manager"], managePermission: PERMISSIONS.PROJECTS_SETTINGS_MANAGE },
  hotel: { key: "hotel", label: "Hotel", roleNames: ["Hotel Manager", "Front Desk Agent", "Housekeeping Supervisor", "Housekeeper", "Restaurant Manager", "Revenue Manager"], managePermission: PERMISSIONS.HOTEL_SETTINGS_MANAGE },
  pharmacy: { key: "pharmacy", label: "Pharmacy", roleNames: ["Pharmacy Manager", "Pharmacist", "Pharmacy Technician"], managePermission: PERMISSIONS.PHARMACY_SETTINGS_MANAGE },
  hospital: { key: "hospital", label: "Hospital", roleNames: ["Hospital Administrator", "Receptionist", "Doctor", "Nurse", "Laboratory Scientist", "Radiology Staff", "Hospital Pharmacist", "Billing Officer", "Records Officer"], managePermission: PERMISSIONS.HOSPITAL_SETTINGS_MANAGE },
};

export function getModuleTeamConfig(value: string): ModuleTeamConfig | null {
  return value in MODULE_TEAM_CONFIGS ? MODULE_TEAM_CONFIGS[value as ModuleTeamKey] : null;
}
