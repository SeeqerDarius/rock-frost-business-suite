import { LayoutGrid, UsersRound, CalendarClock, ClipboardCheck, BarChart3, Settings, Banknote, PlayCircle, ReceiptText } from "lucide-react";
import type { TenantContext } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { ModuleNavItem } from "@/types/module";

export function getPeopleAndPayrollNavigation(tenant: TenantContext): ModuleNavItem[] {
  const canOpenHr = tenant.permissions.some((permission) => permission.startsWith("hr."));
  const canOpenPayroll = tenant.permissions.some((permission) => permission.startsWith("payroll."));
  const overviewHref = canOpenHr ? "/app/hr" : "/app/payroll";
  const items: ModuleNavItem[] = [
    { label: "People Overview", href: overviewHref, icon: <LayoutGrid className="size-4" /> },
  ];

  if (canOpenHr) {
    if (hasPermission(tenant, PERMISSIONS.HR_VIEW) || hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
      items.push({ label: "Employees", href: "/app/hr/employees", icon: <UsersRound className="size-4" />, group: "Human Resources" });
    }
    if (hasPermission(tenant, PERMISSIONS.HR_LEAVE_MANAGE)) items.push({ label: "Leave", href: "/app/hr/leave", icon: <CalendarClock className="size-4" />, group: "Human Resources" });
    if (hasPermission(tenant, PERMISSIONS.HR_REVIEWS_MANAGE)) items.push({ label: "Reviews", href: "/app/hr/reviews", icon: <ClipboardCheck className="size-4" />, group: "Human Resources" });
    if (hasPermission(tenant, PERMISSIONS.HR_REPORTS_VIEW)) items.push({ label: "HR Reports", href: "/app/hr/reports", icon: <BarChart3 className="size-4" />, group: "Human Resources" });
    if (hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) items.push({ label: "HR Settings", href: "/app/hr/settings", icon: <Settings className="size-4" />, group: "Human Resources" });
  }

  if (canOpenPayroll) {
    if (hasPermission(tenant, PERMISSIONS.PAYROLL_COMPENSATION_MANAGE)) items.push({ label: "Compensation", href: "/app/payroll/compensation", icon: <Banknote className="size-4" />, group: "Payroll" });
    if (hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) items.push({ label: "Payroll Runs", href: "/app/payroll/runs", icon: <PlayCircle className="size-4" />, group: "Payroll" });
    if (hasPermission(tenant, PERMISSIONS.PAYROLL_PAYSLIPS_VIEW)) items.push({ label: "Payslips", href: "/app/payroll/payslips", icon: <ReceiptText className="size-4" />, group: "Payroll" });
    if (hasPermission(tenant, PERMISSIONS.PAYROLL_REPORTS_VIEW)) items.push({ label: "Payroll Reports", href: "/app/payroll/reports", icon: <BarChart3 className="size-4" />, group: "Payroll" });
    if (hasPermission(tenant, PERMISSIONS.PAYROLL_SETTINGS_MANAGE)) items.push({ label: "Payroll Settings", href: "/app/payroll/settings", icon: <Settings className="size-4" />, group: "Payroll" });
  }

  return items;
}
