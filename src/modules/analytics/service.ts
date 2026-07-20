import "server-only";

import { getFleetSummary } from "@/modules/fleet/service";
import { getInstallmentSummary } from "@/modules/installment/service";
import { getCrmSummary } from "@/modules/crm/service";
import { getInventorySummary } from "@/modules/inventory/service";
import { getAccountingSummary } from "@/modules/accounting/service";
import { getHrSummary } from "@/modules/hr/service";
import { getProcurementSummary } from "@/modules/procurement/service";
import { getPayrollSummary } from "@/modules/payroll/service";

/**
 * Analytics owns no database tables of its own — it is a pure aggregation
 * layer that reads every other module's own summary function (never their
 * Prisma models directly) and combines the results. Every function here
 * takes the caller's enabled-module list explicitly and only calls into a
 * module that's actually enabled for the organization, so a module that
 * isn't activated for this org never gets queried.
 */

function has(enabledModules: string[], key: string) {
  return enabledModules.includes(key);
}

export async function getFinancialOverview(organizationId: string, enabledModules: string[]) {
  const [accounting, payroll] = await Promise.all([
    has(enabledModules, "accounting") ? getAccountingSummary(organizationId) : null,
    has(enabledModules, "payroll") ? getPayrollSummary(organizationId) : null,
  ]);
  return { accounting, payroll };
}

export async function getSalesOverview(organizationId: string, enabledModules: string[]) {
  const [crm, installment] = await Promise.all([
    has(enabledModules, "crm") ? getCrmSummary(organizationId) : null,
    has(enabledModules, "installment") ? getInstallmentSummary(organizationId) : null,
  ]);
  return { crm, installment };
}

export async function getOperationsOverview(organizationId: string, enabledModules: string[]) {
  const [fleet, inventory, procurement] = await Promise.all([
    has(enabledModules, "fleet") ? getFleetSummary(organizationId) : null,
    has(enabledModules, "inventory") ? getInventorySummary(organizationId) : null,
    has(enabledModules, "procurement") ? getProcurementSummary(organizationId) : null,
  ]);
  return { fleet, inventory, procurement };
}

export async function getPeopleOverview(organizationId: string, enabledModules: string[]) {
  const hr = has(enabledModules, "hr") ? await getHrSummary(organizationId) : null;
  return { hr };
}

export async function getAnalyticsOverview(organizationId: string, enabledModules: string[]) {
  const [financial, sales, operations, people] = await Promise.all([
    getFinancialOverview(organizationId, enabledModules),
    getSalesOverview(organizationId, enabledModules),
    getOperationsOverview(organizationId, enabledModules),
    getPeopleOverview(organizationId, enabledModules),
  ]);

  const totalRevenue = (financial.accounting?.totalRevenue ?? 0) + (sales.installment?.totalCollected ?? 0);
  const cashBalance = financial.accounting?.cashBalance ?? 0;
  const netIncome = financial.accounting?.netIncome ?? 0;
  const pipelineValue = sales.crm?.pipelineValue ?? 0;
  const activeEmployees = people.hr?.activeEmployeeCount ?? 0;
  const vehicleCount = operations.fleet?.vehicleCount ?? 0;
  const stockValue = operations.inventory?.totalStockValue ?? 0;
  const openOrderValue = operations.procurement?.openOrderValue ?? 0;
  const lastPayrollNet = financial.payroll?.lastRunTotalNet ?? 0;

  const enabledCount = [
    "fleet",
    "installment",
    "crm",
    "inventory",
    "accounting",
    "hr",
    "procurement",
    "payroll",
  ].filter((key) => has(enabledModules, key)).length;

  return {
    financial,
    sales,
    operations,
    people,
    totalRevenue,
    cashBalance,
    netIncome,
    pipelineValue,
    activeEmployees,
    vehicleCount,
    stockValue,
    openOrderValue,
    lastPayrollNet,
    enabledModuleCount: enabledCount,
  };
}
