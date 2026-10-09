import "server-only";

import { Prisma, type ContractBillingDirection, type ContractLinkType, type ContractStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  assessContractRisk,
  ContractRuleError,
  planBillingDates,
  resolveRiskWeights,
  resolveValueThresholds,
  type RiskAssessment,
  type RiskInput,
} from "./rules";
import {
  can,
  ContractError,
  ContractForbiddenError,
  ContractNotFoundError,
  getContractSettings,
  loadAccessibleContract,
  requirePermission,
  type ContractActor,
  type Tx,
} from "./service";

// --- Linked records -------------------------------------------------------------

/**
 * Records a contract can link to. Links are relationships only: they never
 * change the linked record. Linking needs access to the target's module,
 * and labels are shown only to users who can access that module.
 */
export const LINK_TARGETS: Record<ContractLinkType, { module: string; label: string; href: (id: string) => string }> = {
  ACCOUNTING_CONTACT: { module: "accounting", label: "Accounting contact", href: () => "/app/accounting/contacts" },
  ACCOUNTING_INVOICE: { module: "accounting", label: "Invoice", href: () => "/app/accounting/invoices" },
  ACCOUNTING_BILL: { module: "accounting", label: "Bill", href: () => "/app/accounting/bills" },
  FLEET_VEHICLE: { module: "fleet", label: "Vehicle", href: () => "/app/fleet/vehicles" },
  FLEET_DRIVER: { module: "fleet", label: "Driver", href: () => "/app/fleet/drivers" },
  FLEET_OWNER: { module: "fleet", label: "Vehicle owner", href: () => "/app/fleet/owners" },
  FLEET_WORK_AND_PAY: { module: "fleet", label: "Work and Pay agreement", href: () => "/app/fleet/work-and-pay" },
  HR_EMPLOYEE: { module: "hr", label: "Employee", href: (id) => `/app/hr/employees/${id}` },
  PROJECT: { module: "projects", label: "Project", href: () => "/app/projects/projects" },
};

export const LINK_TYPES = Object.keys(LINK_TARGETS) as ContractLinkType[];

type TargetSummary = { label: string; detail: string | null; financial: { amount: string; paid: string; currency: string | null; status: string } | null };

/** Resolves organization-scoped targets of one type; ids from another organization simply do not resolve. */
async function resolveTargets(client: Tx | typeof db, organizationId: string, type: ContractLinkType, ids: string[]): Promise<Map<string, TargetSummary>> {
  const result = new Map<string, TargetSummary>();
  if (!ids.length) return result;
  const where = { id: { in: ids }, organizationId };
  const put = (id: string, label: string, detail: string | null = null, financial: TargetSummary["financial"] = null) => result.set(id, { label, detail, financial });
  switch (type) {
    case "ACCOUNTING_CONTACT":
      for (const row of await client.accountingContact.findMany({ where, select: { id: true, name: true, currency: true } })) put(row.id, row.name, row.currency ? `Default currency ${row.currency}` : null);
      break;
    case "ACCOUNTING_INVOICE":
      for (const row of await client.accountingInvoice.findMany({ where, select: { id: true, invoiceNumber: true, customerName: true, amount: true, amountPaid: true, currency: true, status: true, dueDate: true } })) {
        put(row.id, `Invoice ${row.invoiceNumber}`, `${row.customerName}, due ${row.dueDate.toISOString().slice(0, 10)}`, { amount: row.amount.toFixed(2), paid: row.amountPaid.toFixed(2), currency: row.currency, status: row.status });
      }
      break;
    case "ACCOUNTING_BILL":
      for (const row of await client.accountingBill.findMany({ where, select: { id: true, billNumber: true, supplierName: true, amount: true, amountPaid: true, currency: true, status: true, dueDate: true } })) {
        put(row.id, `Bill ${row.billNumber}`, `${row.supplierName}, due ${row.dueDate.toISOString().slice(0, 10)}`, { amount: row.amount.toFixed(2), paid: row.amountPaid.toFixed(2), currency: row.currency, status: row.status });
      }
      break;
    case "FLEET_VEHICLE":
      for (const row of await client.fleetVehicle.findMany({ where, select: { id: true, plateNumber: true, status: true } })) put(row.id, row.plateNumber, row.status.toLowerCase().replace(/_/g, " "));
      break;
    case "FLEET_DRIVER":
      for (const row of await client.fleetDriver.findMany({ where, select: { id: true, name: true, status: true } })) put(row.id, row.name, row.status.toLowerCase().replace(/_/g, " "));
      break;
    case "FLEET_OWNER":
      for (const row of await client.fleetOwner.findMany({ where, select: { id: true, name: true } })) put(row.id, row.name);
      break;
    case "FLEET_WORK_AND_PAY":
      for (const row of await client.fleetWorkAndPayContract.findMany({ where, select: { id: true, contractName: true, clientName: true, contractStatus: true } })) put(row.id, row.contractName, `${row.clientName}, ${row.contractStatus.toLowerCase().replace(/_/g, " ")}`);
      break;
    case "HR_EMPLOYEE":
      for (const row of await client.hrEmployee.findMany({ where, select: { id: true, fullName: true, employeeNumber: true } })) put(row.id, row.fullName, row.employeeNumber);
      break;
    case "PROJECT":
      for (const row of await client.project.findMany({ where, select: { id: true, name: true, code: true, status: true } })) put(row.id, row.name, `${row.code}, ${row.status.toLowerCase().replace(/_/g, " ")}`);
      break;
  }
  return result;
}

/** Choices for the link dialog: recent records of each type the user's modules allow. */
export async function listLinkTargetOptions(organizationId: string, allowedModules: string[]) {
  const allowed = (type: ContractLinkType) => allowedModules.includes(LINK_TARGETS[type].module);
  const take = 200;
  const where = { organizationId };
  const options: Partial<Record<ContractLinkType, { id: string; label: string }[]>> = {};
  const tasks: Promise<void>[] = [];
  const load = (type: ContractLinkType, run: () => Promise<{ id: string; label: string }[]>) => { if (allowed(type)) tasks.push(run().then((rows) => { options[type] = rows; })); };
  load("ACCOUNTING_CONTACT", async () => (await db.accountingContact.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take })).map((row) => ({ id: row.id, label: row.name })));
  load("ACCOUNTING_INVOICE", async () => (await db.accountingInvoice.findMany({ where, select: { id: true, invoiceNumber: true, customerName: true }, orderBy: { issueDate: "desc" }, take })).map((row) => ({ id: row.id, label: `${row.invoiceNumber} (${row.customerName})` })));
  load("ACCOUNTING_BILL", async () => (await db.accountingBill.findMany({ where, select: { id: true, billNumber: true, supplierName: true }, orderBy: { billDate: "desc" }, take })).map((row) => ({ id: row.id, label: `${row.billNumber} (${row.supplierName})` })));
  load("FLEET_VEHICLE", async () => (await db.fleetVehicle.findMany({ where, select: { id: true, plateNumber: true }, orderBy: { plateNumber: "asc" }, take })).map((row) => ({ id: row.id, label: row.plateNumber })));
  load("FLEET_DRIVER", async () => (await db.fleetDriver.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take })).map((row) => ({ id: row.id, label: row.name })));
  load("FLEET_OWNER", async () => (await db.fleetOwner.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take })).map((row) => ({ id: row.id, label: row.name })));
  load("FLEET_WORK_AND_PAY", async () => (await db.fleetWorkAndPayContract.findMany({ where, select: { id: true, contractName: true, clientName: true }, orderBy: { createdAt: "desc" }, take })).map((row) => ({ id: row.id, label: `${row.contractName} (${row.clientName})` })));
  load("HR_EMPLOYEE", async () => (await db.hrEmployee.findMany({ where, select: { id: true, fullName: true, employeeNumber: true }, orderBy: { fullName: "asc" }, take })).map((row) => ({ id: row.id, label: `${row.fullName} (${row.employeeNumber})` })));
  load("PROJECT", async () => (await db.project.findMany({ where, select: { id: true, name: true, code: true }, orderBy: { name: "asc" }, take })).map((row) => ({ id: row.id, label: `${row.name} (${row.code})` })));
  await Promise.all(tasks);
  return options;
}

export async function addContractLink(actor: ContractActor, contractId: string, input: { linkType: ContractLinkType; entityId: string }, allowedModules: string[]) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  const target = LINK_TARGETS[input.linkType];
  if (!target) throw new ContractError("Choose what to link.");
  if (!allowedModules.includes(target.module)) throw new ContractForbiddenError("You need access to that module to link its records.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.status === "ARCHIVED") throw new ContractError("Archived contracts cannot be linked.");
    const resolved = await resolveTargets(tx, actor.organizationId, input.linkType, [input.entityId]);
    const summary = resolved.get(input.entityId);
    if (!summary) throw new ContractNotFoundError("Record not found in this organization.");
    const link = await tx.contractLink.create({ data: { organizationId: actor.organizationId, contractId, linkType: input.linkType, entityId: input.entityId, label: summary.label.slice(0, 200), createdById: actor.userId } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ContractError("That record is already linked to this contract.");
      throw error;
    });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.link_added", entityName: "Contract", entityId: contractId, metadata: { linkId: link.id, linkType: input.linkType, entityId: input.entityId } }, tx);
    return link;
  });
}

export async function removeContractLink(actor: ContractActor, contractId: string, linkId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    await loadAccessibleContract(actor, contractId, tx);
    const link = await tx.contractLink.findFirst({ where: { id: linkId, contractId, organizationId: actor.organizationId } });
    if (!link) throw new ContractNotFoundError("Link not found.");
    const billing = await tx.contractBillingLine.count({ where: { contractId, OR: [{ invoiceId: link.entityId }, { billId: link.entityId }] } });
    if (billing) throw new ContractError("This document records a billing line as invoiced. Cancel or relink that line first.");
    await tx.contractLink.delete({ where: { id: link.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.link_removed", entityName: "Contract", entityId: contractId, metadata: { linkType: link.linkType, entityId: link.entityId } }, tx);
  });
}

/** Links on a contract with current details. Records in modules the viewer cannot access are shown without their details. */
export async function getContractLinks(actor: ContractActor, contractId: string, allowedModules: string[]) {
  const contract = await loadAccessibleContract(actor, contractId);
  const links = await db.contractLink.findMany({ where: { contractId: contract.id }, orderBy: [{ linkType: "asc" }, { createdAt: "asc" }] });
  const byType = new Map<ContractLinkType, string[]>();
  for (const link of links) byType.set(link.linkType, [...(byType.get(link.linkType) ?? []), link.entityId]);
  const summaries = new Map<string, TargetSummary>();
  for (const [type, ids] of byType) {
    if (!allowedModules.includes(LINK_TARGETS[type].module)) continue;
    for (const [id, summary] of await resolveTargets(db, actor.organizationId, type, ids)) summaries.set(`${type}:${id}`, summary);
  }
  const financial = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  return links.map((link) => {
    const target = LINK_TARGETS[link.linkType];
    const visible = allowedModules.includes(target.module);
    const summary = summaries.get(`${link.linkType}:${link.entityId}`);
    return {
      id: link.id,
      linkType: link.linkType,
      typeLabel: target.label,
      visible,
      missing: visible && !summary,
      label: visible ? summary?.label ?? link.label ?? "Record no longer available" : `Linked ${target.label.toLowerCase()}`,
      detail: visible ? summary?.detail ?? null : null,
      financial: visible && financial ? summary?.financial ?? null : null,
      href: visible && summary ? target.href(link.entityId) : null,
      createdAt: link.createdAt,
    };
  });
}

// --- Billing schedule ---------------------------------------------------------------

const PLANNABLE: ContractStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"];
const amountPattern = /^\d{1,14}(\.\d{1,2})?$/;

function requireFinancialEditor(actor: ContractActor) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  if (!can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) throw new ContractForbiddenError("Billing schedules need contract financial access.");
}

function positiveAmount(value: string) {
  const trimmed = value.trim();
  if (!amountPattern.test(trimmed) || new Prisma.Decimal(trimmed).lessThanOrEqualTo(0)) throw new ContractError("Enter an amount greater than zero with at most two decimal places.");
  return new Prisma.Decimal(trimmed);
}

/**
 * Creates planned billing lines in the contract currency, every N months
 * from the first due date until the expiration date (or for a fixed number
 * of periods when the contract has none). Never creates invoices or journals.
 */
export async function generateBillingPlan(actor: ContractActor, contractId: string, input: { direction: ContractBillingDirection; frequencyMonths: number; amount: string; firstDueDate: Date; description: string; periods?: number | null }) {
  requireFinancialEditor(actor);
  const amount = positiveAmount(input.amount);
  const description = input.description.trim();
  if (!description) throw new ContractError("Describe what is billed.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contract-billing:${contractId}`}))`;
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!PLANNABLE.includes(contract.status)) throw new ContractError("Billing can be planned only for draft, approved, or active contracts.");
    const periods = input.periods ?? null;
    if (!contract.expirationDate && !periods) throw new ContractError("This contract has no expiration date. Enter the number of periods to plan.");
    if (periods !== null && (!Number.isInteger(periods) || periods < 1 || periods > 120)) throw new ContractError("Plan between 1 and 120 periods.");
    let dates: Date[];
    try {
      dates = planBillingDates(input.firstDueDate, input.frequencyMonths, periods ? null : contract.expirationDate, periods ?? 120);
    } catch (error) {
      if (error instanceof ContractRuleError) throw new ContractError(error.message);
      throw error;
    }
    if (!dates.length) throw new ContractError("The first due date is after the contract's expiration date.");
    await tx.contractBillingLine.createMany({ data: dates.map((dueDate) => ({ organizationId: actor.organizationId, contractId, direction: input.direction, dueDate, amount, currency: contract.currency, description: description.slice(0, 200), createdById: actor.userId })) });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.billing_planned", entityName: "Contract", entityId: contractId, metadata: { direction: input.direction, lines: dates.length, amountPerLine: amount.toFixed(2), currency: contract.currency, first: dates[0].toISOString().slice(0, 10), last: dates[dates.length - 1].toISOString().slice(0, 10) } }, tx);
    return { lines: dates.length };
  }, { timeout: 20_000 });
}

export async function addBillingLine(actor: ContractActor, contractId: string, input: { direction: ContractBillingDirection; dueDate: Date; amount: string; description: string }) {
  requireFinancialEditor(actor);
  const amount = positiveAmount(input.amount);
  if (!input.description.trim()) throw new ContractError("Describe what is billed.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!PLANNABLE.includes(contract.status)) throw new ContractError("Billing can be planned only for draft, approved, or active contracts.");
    const line = await tx.contractBillingLine.create({ data: { organizationId: actor.organizationId, contractId, direction: input.direction, dueDate: input.dueDate, amount, currency: contract.currency, description: input.description.trim().slice(0, 200), createdById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.billing_line_added", entityName: "Contract", entityId: contractId, metadata: { lineId: line.id, direction: line.direction, amount: amount.toFixed(2), dueDate: line.dueDate.toISOString().slice(0, 10) } }, tx);
    return line;
  });
}

export async function cancelBillingLine(actor: ContractActor, lineId: string, reason: string) {
  requireFinancialEditor(actor);
  if (!reason.trim()) throw new ContractError("Enter a reason for cancelling the line.");
  const located = await db.contractBillingLine.findFirst({ where: { id: lineId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Billing line not found.");
  return db.$transaction(async (tx) => {
    await loadAccessibleContract(actor, located.contractId, tx);
    const result = await tx.contractBillingLine.updateMany({ where: { id: lineId, status: "PLANNED" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim().slice(0, 500) } });
    if (result.count !== 1) throw new ContractError("Only planned lines can be cancelled.");
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.billing_line_cancelled", entityName: "Contract", entityId: located.contractId, metadata: { lineId, reason: reason.trim() } }, tx);
  });
}

/**
 * Records that a planned line was invoiced by linking the Accounting
 * invoice (receivable) or bill (payable) already raised for it. The
 * document must belong to the organization, use the contract currency, and
 * not already settle another line. The document itself is not changed.
 */
export async function markBillingLineInvoiced(actor: ContractActor, lineId: string, documentId: string) {
  requireFinancialEditor(actor);
  const located = await db.contractBillingLine.findFirst({ where: { id: lineId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Billing line not found.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contract-billing:${located.contractId}`}))`;
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    const line = await tx.contractBillingLine.findUniqueOrThrow({ where: { id: lineId } });
    if (line.status !== "PLANNED") throw new ContractError("Only planned lines can be marked as invoiced.");
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true } });
    const receivable = line.direction === "RECEIVABLE";
    const document = receivable
      ? await tx.accountingInvoice.findFirst({ where: { id: documentId, organizationId: actor.organizationId }, select: { id: true, invoiceNumber: true, currency: true, status: true } })
      : await tx.accountingBill.findFirst({ where: { id: documentId, organizationId: actor.organizationId }, select: { id: true, billNumber: true, currency: true, status: true } });
    if (!document) throw new ContractNotFoundError(receivable ? "Invoice not found in this organization." : "Bill not found in this organization.");
    if (document.status === "VOID" || document.status === "DRAFT") throw new ContractError(`Link an issued ${receivable ? "invoice" : "bill"}, not a draft or void one.`);
    const documentCurrency = document.currency ?? organization.currency ?? "GHS";
    if (documentCurrency !== line.currency) throw new ContractError(`The ${receivable ? "invoice" : "bill"} is in ${documentCurrency}, but the line is in ${line.currency}.`);
    const used = await tx.contractBillingLine.findFirst({ where: { organizationId: actor.organizationId, status: "INVOICED", ...(receivable ? { invoiceId: document.id } : { billId: document.id }) }, select: { id: true } });
    if (used) throw new ContractError(`That ${receivable ? "invoice" : "bill"} already settles another billing line.`);
    await tx.contractBillingLine.update({ where: { id: line.id }, data: { status: "INVOICED", invoiceId: receivable ? document.id : null, billId: receivable ? null : document.id, linkedAt: new Date(), linkedById: actor.userId } });
    const linkType: ContractLinkType = receivable ? "ACCOUNTING_INVOICE" : "ACCOUNTING_BILL";
    const label = "invoiceNumber" in document ? `Invoice ${document.invoiceNumber}` : `Bill ${document.billNumber}`;
    await tx.contractLink.createMany({ data: [{ organizationId: actor.organizationId, contractId: contract.id, linkType, entityId: document.id, label, createdById: actor.userId }], skipDuplicates: true });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.billing_line_invoiced", entityName: "Contract", entityId: contract.id, metadata: { lineId, documentId: document.id, documentType: receivable ? "invoice" : "bill", amount: line.amount.toFixed(2), currency: line.currency } }, tx);
  });
}

/** Billing lines with their linked document and totals per direction and status. Needs financial access. */
export async function getBillingSchedule(actor: ContractActor, contractId: string) {
  if (!can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) throw new ContractForbiddenError("Billing schedules need contract financial access.");
  const contract = await loadAccessibleContract(actor, contractId);
  const lines = await db.contractBillingLine.findMany({ where: { contractId: contract.id }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  const [invoices, bills] = await Promise.all([
    resolveTargets(db, actor.organizationId, "ACCOUNTING_INVOICE", lines.flatMap((line) => (line.invoiceId ? [line.invoiceId] : []))),
    resolveTargets(db, actor.organizationId, "ACCOUNTING_BILL", lines.flatMap((line) => (line.billId ? [line.billId] : []))),
  ]);
  const totals = { RECEIVABLE: { planned: new Prisma.Decimal(0), invoiced: new Prisma.Decimal(0) }, PAYABLE: { planned: new Prisma.Decimal(0), invoiced: new Prisma.Decimal(0) } };
  for (const line of lines) {
    if (line.status === "PLANNED") totals[line.direction].planned = totals[line.direction].planned.plus(line.amount);
    if (line.status === "INVOICED") totals[line.direction].invoiced = totals[line.direction].invoiced.plus(line.amount);
  }
  return {
    currency: contract.currency,
    lines: lines.map((line) => ({ ...line, document: line.invoiceId ? invoices.get(line.invoiceId) ?? null : line.billId ? bills.get(line.billId) ?? null : null })),
    totals: { RECEIVABLE: { planned: totals.RECEIVABLE.planned.toFixed(2), invoiced: totals.RECEIVABLE.invoiced.toFixed(2) }, PAYABLE: { planned: totals.PAYABLE.planned.toFixed(2), invoiced: totals.PAYABLE.invoiced.toFixed(2) } },
  };
}

/** Issued invoices or bills in the contract currency that are not yet tied to a billing line. */
export async function listBillableDocuments(organizationId: string, currency: string, baseCurrency: string) {
  const currencyWhere = currency === baseCurrency ? { OR: [{ currency }, { currency: null }] } : { currency };
  const [invoices, bills, used] = await Promise.all([
    db.accountingInvoice.findMany({ where: { organizationId, status: { notIn: ["DRAFT", "VOID"] }, ...currencyWhere }, select: { id: true, invoiceNumber: true, customerName: true, amount: true }, orderBy: { issueDate: "desc" }, take: 200 }),
    db.accountingBill.findMany({ where: { organizationId, status: { notIn: ["DRAFT", "VOID"] }, ...currencyWhere }, select: { id: true, billNumber: true, supplierName: true, amount: true }, orderBy: { billDate: "desc" }, take: 200 }),
    db.contractBillingLine.findMany({ where: { organizationId, status: "INVOICED" }, select: { invoiceId: true, billId: true } }),
  ]);
  const taken = new Set(used.flatMap((line) => [line.invoiceId, line.billId].filter((id): id is string => !!id)));
  return {
    invoices: invoices.filter((row) => !taken.has(row.id)).map((row) => ({ id: row.id, label: `${row.invoiceNumber} (${row.customerName}, ${row.amount.toFixed(2)})` })),
    bills: bills.filter((row) => !taken.has(row.id)).map((row) => ({ id: row.id, label: `${row.billNumber} (${row.supplierName}, ${row.amount.toFixed(2)})` })),
  };
}

// --- Calculated risk -------------------------------------------------------------

type RiskContract = { id: string; status: ContractStatus; riskLevel: RiskInput["riskLevel"]; value: Prisma.Decimal | null; currency: string; expirationDate: Date | null; renewalType: string; noticePeriodDays: number | null };

/** Calculated risk for many contracts with a fixed number of queries. */
export async function assessContracts(organizationId: string, contracts: RiskContract[], now: Date = new Date()): Promise<Map<string, RiskAssessment>> {
  const result = new Map<string, RiskAssessment>();
  if (!contracts.length) return result;
  const ids = contracts.map((contract) => contract.id);
  const [settings, primaryDocs, signed, overdue, required, attached] = await Promise.all([
    getContractSettings(organizationId),
    db.contractDocument.groupBy({ by: ["contractId"], where: { contractId: { in: ids }, documentType: "PRIMARY", removedAt: null }, _count: { _all: true } }),
    db.contractSignature.groupBy({ by: ["contractId"], where: { contractId: { in: ids }, status: "SIGNED" }, _count: { _all: true } }),
    db.contractObligation.groupBy({ by: ["contractId"], where: { contractId: { in: ids }, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } }, _count: { _all: true } }),
    db.contractClause.findMany({ where: { organizationId, status: "APPROVED", usage: "REQUIRED" }, select: { code: true }, distinct: ["code"] }),
    db.contractClauseLink.findMany({ where: { contractId: { in: ids } }, select: { contractId: true, clause: { select: { code: true } } } }),
  ]);
  const weights = resolveRiskWeights(settings.riskWeights);
  const thresholds = resolveValueThresholds(settings.riskValueThresholds);
  const count = (rows: { contractId: string; _count: { _all: number } }[]) => new Map(rows.map((row) => [row.contractId, row._count._all]));
  const primary = count(primaryDocs);
  const signatures = count(signed);
  const overdueCount = count(overdue);
  const requiredCodes = required.map((clause) => clause.code);
  const attachedCodes = new Map<string, Set<string>>();
  for (const link of attached) attachedCodes.set(link.contractId, (attachedCodes.get(link.contractId) ?? new Set()).add(link.clause.code));
  for (const contract of contracts) {
    const codes = attachedCodes.get(contract.id) ?? new Set<string>();
    result.set(contract.id, assessContractRisk({
      status: contract.status, riskLevel: contract.riskLevel, value: contract.value, currency: contract.currency, expirationDate: contract.expirationDate, renewalType: contract.renewalType, noticePeriodDays: contract.noticePeriodDays,
      hasPrimaryDocument: (primary.get(contract.id) ?? 0) > 0, hasSignature: (signatures.get(contract.id) ?? 0) > 0,
      missingRequiredClauses: requiredCodes.filter((code) => !codes.has(code)).length, overdueObligations: overdueCount.get(contract.id) ?? 0,
    }, weights, thresholds, now));
  }
  return result;
}

export async function getContractRisk(actor: ContractActor, contractId: string) {
  const contract = await loadAccessibleContract(actor, contractId);
  const assessment = (await assessContracts(actor.organizationId, [contract])).get(contract.id)!;
  // Value-based factors would reveal the value band to users without financial access.
  if (!can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) return { ...assessment, factors: assessment.factors.map((factor) => (factor.key === "highValue" ? { ...factor, label: "Financial factor" } : factor)) };
  return assessment;
}

/** Saves risk weights (0 to 50 points each) and per-currency high-value thresholds. */
export async function updateRiskSettings(actor: ContractActor, input: { weights: Record<string, number>; thresholds: Record<string, string> }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS);
  const weights = resolveRiskWeights(input.weights);
  for (const [key, value] of Object.entries(input.weights)) if (!(key in weights) || weights[key as keyof typeof weights] !== value) throw new ContractError("Each risk weight must be a whole number from 0 to 50.");
  const thresholds = resolveValueThresholds(input.thresholds);
  if (Object.keys(thresholds).length !== Object.keys(input.thresholds).length) throw new ContractError("Enter thresholds as a currency code and an amount, for example GHS=500000.");
  await getContractSettings(actor.organizationId);
  await db.contractSettings.update({ where: { organizationId: actor.organizationId }, data: { riskWeights: weights, riskValueThresholds: thresholds } });
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contracts.risk_settings_updated", entityName: "ContractSettings", entityId: actor.organizationId, metadata: { weights, thresholds } });
}
