import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { noticeDeadline, noticeShortfallDays, RISK_FACTORS } from "./rules";
import { accessSubject, accessWhere, can, ContractForbiddenError, requirePermission, type ContractActor } from "./service";
import { assessContracts } from "./integrations";

export type ReportColumn = { key: string; header: string; financial?: boolean; align?: "right" };
export type ReportRow = Record<string, string | number | null>;
export type ReportResult = { columns: ReportColumn[]; rows: ReportRow[]; summary: { label: string; value: string }[]; truncated: boolean };
export type ReportFilters = { from?: Date | null; to?: Date | null; days?: number | null };
export type ResolvedReportFilters = { from: Date; to: Date; days: number };

type ReportDefinition = { title: string; description: string; financialOnly?: boolean; dateRange?: "past" | "future"; build: (actor: ContractActor, visible: Prisma.ContractWhereInput, filters: ResolvedReportFilters, limit: number) => Promise<Omit<ReportResult, "truncated"> & { truncated?: boolean }> };

const DAY = 86_400_000;
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const money = (value: Prisma.Decimal | null | undefined) => (value ? value.toFixed(2) : null);
const words = (value: string) => value.toLowerCase().replace(/_/g, " ");
const person = (user: { name: string | null; email: string } | null | undefined) => (user ? user.name ?? user.email : null);

export const CONTRACT_REPORTS: Record<string, ReportDefinition> = {
  register: {
    title: "Contract register",
    description: "Every contract you can access (archived excluded), with dates, owner, and value.",
    async build(_actor, visible, _filters, limit) {
      const rows = await db.contract.findMany({ where: { AND: [visible, { status: { not: "ARCHIVED" } }] }, include: { category: { select: { name: true } }, owner: { select: { name: true, email: true } } }, orderBy: { contractNumber: "asc" }, take: limit + 1 });
      return {
        truncated: rows.length > limit,
        columns: [
          { key: "number", header: "Number" }, { key: "title", header: "Title" }, { key: "counterparty", header: "Counterparty" }, { key: "status", header: "Status" }, { key: "category", header: "Category" },
          { key: "owner", header: "Owner" }, { key: "start", header: "Start" }, { key: "expiration", header: "Expiration" }, { key: "renewal", header: "Renewal type" }, { key: "risk", header: "Assigned risk" },
          { key: "currency", header: "Currency" }, { key: "value", header: "Value", financial: true, align: "right" },
        ],
        rows: rows.slice(0, limit).map((row) => ({ number: row.contractNumber, title: row.title, counterparty: row.counterpartyName, status: words(row.status), category: row.category?.name ?? null, owner: person(row.owner), start: day(row.startDate), expiration: day(row.expirationDate), renewal: words(row.renewalType), risk: words(row.riskLevel), currency: row.currency, value: money(row.value) })),
        summary: [{ label: "Contracts", value: String(Math.min(rows.length, limit)) }],
      };
    },
  },
  expiring: {
    title: "Expiring contracts",
    description: "Active contracts expiring within the chosen number of days, with notice deadlines.",
    async build(_actor, visible, filters, limit) {
      const now = new Date();
      const rows = await db.contract.findMany({ where: { AND: [visible, { status: "ACTIVE", expirationDate: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + filters.days * DAY) } }] }, include: { owner: { select: { name: true, email: true } } }, orderBy: { expirationDate: "asc" }, take: limit + 1 });
      return {
        truncated: rows.length > limit,
        columns: [
          { key: "number", header: "Number" }, { key: "title", header: "Title" }, { key: "counterparty", header: "Counterparty" }, { key: "expiration", header: "Expiration" }, { key: "daysLeft", header: "Days left", align: "right" },
          { key: "noticeDeadline", header: "Notice deadline" }, { key: "renewal", header: "Renewal type" }, { key: "owner", header: "Owner" }, { key: "currency", header: "Currency" }, { key: "value", header: "Value", financial: true, align: "right" },
        ],
        rows: rows.slice(0, limit).map((row) => ({ number: row.contractNumber, title: row.title, counterparty: row.counterpartyName, expiration: day(row.expirationDate), daysLeft: Math.ceil((row.expirationDate!.getTime() - now.getTime()) / DAY), noticeDeadline: day(noticeDeadline(row.expirationDate, row.noticePeriodDays)), renewal: words(row.renewalType), owner: person(row.owner), currency: row.currency, value: money(row.value) })),
        summary: [{ label: `Expiring within ${filters.days} days`, value: String(Math.min(rows.length, limit)) }],
      };
    },
  },
  "renewal-forecast": {
    title: "Renewal forecast",
    description: "Active contracts reaching expiration in each of the next 12 months, by currency. Values are never added across currencies.",
    async build(_actor, visible) {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 1));
      const contracts = await db.contract.findMany({ where: { AND: [visible, { status: "ACTIVE", expirationDate: { gte: start, lt: end } }] }, select: { expirationDate: true, currency: true, value: true, renewalType: true }, take: 10_000 });
      const buckets = new Map<string, { month: string; currency: string; count: number; auto: number; value: Prisma.Decimal }>();
      for (const contract of contracts) {
        const month = contract.expirationDate!.toISOString().slice(0, 7);
        const key = `${month}|${contract.currency}`;
        const bucket = buckets.get(key) ?? { month, currency: contract.currency, count: 0, auto: 0, value: new Prisma.Decimal(0) };
        bucket.count += 1;
        if (contract.renewalType === "AUTO_RENEWAL" || contract.renewalType === "EVERGREEN") bucket.auto += 1;
        if (contract.value) bucket.value = bucket.value.plus(contract.value);
        buckets.set(key, bucket);
      }
      const rows = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency));
      return {
        columns: [{ key: "month", header: "Month" }, { key: "currency", header: "Currency" }, { key: "count", header: "Expiring", align: "right" }, { key: "auto", header: "Renew automatically", align: "right" }, { key: "value", header: "Value expiring", financial: true, align: "right" }],
        rows: rows.map((row) => ({ month: row.month, currency: row.currency, count: row.count, auto: row.auto, value: row.value.toFixed(2) })),
        summary: [{ label: "Contracts expiring in 12 months", value: String(contracts.length) }],
      };
    },
  },
  obligations: {
    title: "Obligations",
    description: "Open obligations on contracts you can access, with overdue days.",
    async build(_actor, visible, _filters, limit) {
      const now = new Date();
      const rows = await db.contractObligation.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, contract: { AND: [visible, { status: { notIn: ["ARCHIVED", "CANCELLED", "TERMINATED"] } }] } }, include: { contract: { select: { contractNumber: true, title: true } }, owner: { select: { name: true, email: true } } }, orderBy: { dueDate: "asc" }, take: limit + 1 });
      const overdue = rows.filter((row) => row.dueDate < now).length;
      return {
        truncated: rows.length > limit,
        columns: [{ key: "contract", header: "Contract" }, { key: "obligation", header: "Obligation" }, { key: "type", header: "Type" }, { key: "responsible", header: "Responsible" }, { key: "owner", header: "Owner" }, { key: "due", header: "Due" }, { key: "status", header: "Status" }, { key: "overdueDays", header: "Days overdue", align: "right" }],
        rows: rows.slice(0, limit).map((row) => ({ contract: `${row.contract.contractNumber} ${row.contract.title}`, obligation: row.title, type: words(row.obligationType), responsible: row.responsibleParty === "INTERNAL" ? "our organization" : "counterparty", owner: person(row.owner), due: day(row.dueDate), status: words(row.status), overdueDays: row.dueDate < now ? Math.floor((now.getTime() - row.dueDate.getTime()) / DAY) : null })),
        summary: [{ label: "Open", value: String(Math.min(rows.length, limit)) }, { label: "Overdue", value: String(overdue) }],
      };
    },
  },
  risk: {
    title: "Risk",
    description: "Calculated risk for open contracts, next to the risk level people assigned. The score is guidance from your risk settings.",
    async build(actor, visible, _filters, limit) {
      const contracts = await db.contract.findMany({ where: { AND: [visible, { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"] } }] }, select: { id: true, contractNumber: true, title: true, counterpartyName: true, status: true, riskLevel: true, value: true, currency: true, expirationDate: true, renewalType: true, noticePeriodDays: true }, take: 5000 });
      const assessments = await assessContracts(actor.organizationId, contracts);
      const financial = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
      const rows = contracts.map((contract) => ({ contract, assessment: assessments.get(contract.id)! })).sort((a, b) => b.assessment.score - a.assessment.score);
      const bands = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const row of rows) bands[row.assessment.band] += 1;
      return {
        truncated: rows.length > limit,
        columns: [{ key: "number", header: "Number" }, { key: "title", header: "Title" }, { key: "counterparty", header: "Counterparty" }, { key: "status", header: "Status" }, { key: "assigned", header: "Assigned risk" }, { key: "band", header: "Calculated risk" }, { key: "score", header: "Score", align: "right" }, { key: "factors", header: "Factors" }],
        rows: rows.slice(0, limit).map(({ contract, assessment }) => ({
          number: contract.contractNumber, title: contract.title, counterparty: contract.counterpartyName, status: words(contract.status), assigned: words(contract.riskLevel), band: words(assessment.band), score: assessment.score,
          factors: assessment.factors.map((factor) => (factor.key === "highValue" && !financial ? "Financial factor" : RISK_FACTORS[factor.key].label)).join("; "),
        })),
        summary: (Object.keys(bands) as (keyof typeof bands)[]).map((band) => ({ label: `Calculated ${words(band)}`, value: String(bands[band]) })),
      };
    },
  },
  counterparty: {
    title: "Counterparty exposure",
    description: "Active contracts and open planned billing by counterparty and currency.",
    financialOnly: true,
    async build(_actor, visible) {
      const [contracts, billing] = await Promise.all([
        db.contract.findMany({ where: { AND: [visible, { status: "ACTIVE" }] }, select: { counterpartyName: true, currency: true, value: true }, take: 10_000 }),
        db.contractBillingLine.findMany({ where: { status: "PLANNED", contract: { AND: [visible, { status: { in: ["APPROVED", "ACTIVE"] } }] } }, select: { direction: true, amount: true, currency: true, contract: { select: { counterpartyName: true } } }, take: 50_000 }),
      ]);
      const groups = new Map<string, { counterparty: string; currency: string; count: number; value: Prisma.Decimal; receivable: Prisma.Decimal; payable: Prisma.Decimal }>();
      const group = (counterparty: string, currency: string) => {
        const key = `${counterparty.toLowerCase()}|${currency}`;
        if (!groups.has(key)) groups.set(key, { counterparty, currency, count: 0, value: new Prisma.Decimal(0), receivable: new Prisma.Decimal(0), payable: new Prisma.Decimal(0) });
        return groups.get(key)!;
      };
      for (const contract of contracts) { const entry = group(contract.counterpartyName, contract.currency); entry.count += 1; if (contract.value) entry.value = entry.value.plus(contract.value); }
      for (const line of billing) { const entry = group(line.contract.counterpartyName, line.currency); if (line.direction === "RECEIVABLE") entry.receivable = entry.receivable.plus(line.amount); else entry.payable = entry.payable.plus(line.amount); }
      const rows = [...groups.values()].sort((a, b) => b.value.comparedTo(a.value) || a.counterparty.localeCompare(b.counterparty));
      return {
        columns: [{ key: "counterparty", header: "Counterparty" }, { key: "currency", header: "Currency" }, { key: "count", header: "Active contracts", align: "right" }, { key: "value", header: "Active value", financial: true, align: "right" }, { key: "receivable", header: "Planned to invoice", financial: true, align: "right" }, { key: "payable", header: "Planned to be billed", financial: true, align: "right" }],
        rows: rows.map((row) => ({ counterparty: row.counterparty, currency: row.currency, count: row.count, value: row.value.toFixed(2), receivable: row.receivable.toFixed(2), payable: row.payable.toFixed(2) })),
        summary: [{ label: "Counterparties", value: String(new Set(rows.map((row) => row.counterparty.toLowerCase())).size) }],
      };
    },
  },
  billing: {
    title: "Planned billing",
    description: "Billing lines due in the date range, with what has been invoiced. Plans only; no journals are created.",
    financialOnly: true,
    dateRange: "future",
    async build(_actor, visible, filters, limit) {
      const rows = await db.contractBillingLine.findMany({ where: { dueDate: { gte: filters.from, lte: filters.to }, contract: visible }, include: { contract: { select: { contractNumber: true, title: true, counterpartyName: true } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: limit + 1 });
      const totals = new Map<string, Prisma.Decimal>();
      for (const row of rows.slice(0, limit)) if (row.status !== "CANCELLED") totals.set(`${row.direction}|${row.currency}`, (totals.get(`${row.direction}|${row.currency}`) ?? new Prisma.Decimal(0)).plus(row.amount));
      return {
        truncated: rows.length > limit,
        columns: [{ key: "due", header: "Due" }, { key: "contract", header: "Contract" }, { key: "counterparty", header: "Counterparty" }, { key: "direction", header: "Direction" }, { key: "description", header: "Description" }, { key: "currency", header: "Currency" }, { key: "amount", header: "Amount", financial: true, align: "right" }, { key: "status", header: "Status" }],
        rows: rows.slice(0, limit).map((row) => ({ due: day(row.dueDate), contract: `${row.contract.contractNumber} ${row.contract.title}`, counterparty: row.contract.counterpartyName, direction: row.direction === "RECEIVABLE" ? "to invoice" : "to be billed", description: row.description, currency: row.currency, amount: row.amount.toFixed(2), status: words(row.status) })),
        summary: [...totals.entries()].map(([key, total]) => { const [direction, currency] = key.split("|"); return { label: `${direction === "RECEIVABLE" ? "To invoice" : "To be billed"} (${currency})`, value: total.toFixed(2) }; }),
      };
    },
  },
  amendments: {
    title: "Amendments",
    description: "Amendments drafted in the date range and what they changed.",
    dateRange: "past",
    async build(actor, visible, filters, limit) {
      const rows = await db.contractAmendment.findMany({ where: { createdAt: { gte: filters.from, lte: filters.to }, contract: visible }, include: { contract: { select: { contractNumber: true, title: true } }, createdBy: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: limit + 1 });
      const financial = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
      return {
        truncated: rows.length > limit,
        columns: [{ key: "contract", header: "Contract" }, { key: "number", header: "Amendment", align: "right" }, { key: "title", header: "Title" }, { key: "status", header: "Status" }, { key: "fields", header: "Terms changed" }, { key: "author", header: "Drafted by" }, { key: "created", header: "Drafted" }, { key: "applied", header: "Applied" }, { key: "version", header: "Version", align: "right" }],
        rows: rows.slice(0, limit).map((row) => ({
          contract: `${row.contract.contractNumber} ${row.contract.title}`, number: row.amendmentNumber, title: row.title, status: words(row.status),
          fields: Object.keys((row.changes ?? {}) as Record<string, unknown>).map((field) => (!financial && ["value", "paymentTerms", "billingFrequency"].includes(field) ? "financial term" : field)).join(", "),
          author: person(row.createdBy), created: day(row.createdAt), applied: day(row.appliedAt), version: row.appliedVersion,
        })),
        summary: [{ label: "Applied", value: String(rows.slice(0, limit).filter((row) => row.status === "APPLIED").length) }, { label: "Drafts", value: String(rows.slice(0, limit).filter((row) => row.status === "DRAFT").length) }],
      };
    },
  },
  terminated: {
    title: "Terminated contracts",
    description: "Contracts terminated in the date range, with reasons and notice given.",
    dateRange: "past",
    async build(_actor, visible, filters, limit) {
      const rows = await db.contract.findMany({ where: { AND: [visible, { status: { in: ["TERMINATED", "ARCHIVED"] }, terminatedAt: { gte: filters.from, lte: filters.to } }] }, orderBy: { terminatedAt: "desc" }, take: limit + 1 });
      return {
        truncated: rows.length > limit,
        columns: [{ key: "number", header: "Number" }, { key: "title", header: "Title" }, { key: "counterparty", header: "Counterparty" }, { key: "terminated", header: "Recorded" }, { key: "effective", header: "Effective" }, { key: "notice", header: "Notice given" }, { key: "shortNotice", header: "Days short of notice", align: "right" }, { key: "reason", header: "Reason" }],
        rows: rows.slice(0, limit).map((row) => ({ number: row.contractNumber, title: row.title, counterparty: row.counterpartyName, terminated: day(row.terminatedAt), effective: day(row.terminationEffectiveDate), notice: day(row.noticeGivenAt), shortNotice: row.noticeGivenAt && row.terminationEffectiveDate ? noticeShortfallDays(row.noticeGivenAt, row.terminationEffectiveDate, row.noticePeriodDays) : null, reason: row.terminationReason })),
        summary: [{ label: "Terminated", value: String(Math.min(rows.length, limit)) }],
      };
    },
  },
  approvals: {
    title: "Approval performance",
    description: "Approval rounds submitted in the date range: outcome and time to a decision.",
    dateRange: "past",
    async build(_actor, visible, filters, limit) {
      const rows = await db.contractApprovalRequest.findMany({ where: { requestedAt: { gte: filters.from, lte: filters.to }, contract: visible }, include: { contract: { select: { contractNumber: true, title: true } }, requestedBy: { select: { name: true, email: true } }, steps: { orderBy: { stepOrder: "asc" }, select: { name: true, status: true, activatedAt: true, decidedAt: true } } }, orderBy: { requestedAt: "desc" }, take: limit + 1 });
      const hours = (from: Date, to: Date | null) => (to ? Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10 : null);
      const completed = rows.slice(0, limit).filter((row) => row.completedAt && (row.status === "APPROVED" || row.status === "REJECTED" || row.status === "CHANGES_REQUESTED"));
      const average = completed.length ? Math.round((completed.reduce((sum, row) => sum + (row.completedAt!.getTime() - row.requestedAt.getTime()), 0) / completed.length / 3_600_000) * 10) / 10 : null;
      return {
        truncated: rows.length > limit,
        columns: [{ key: "contract", header: "Contract" }, { key: "rule", header: "Rule" }, { key: "submittedBy", header: "Submitted by" }, { key: "submitted", header: "Submitted" }, { key: "outcome", header: "Outcome" }, { key: "hours", header: "Hours to decision", align: "right" }, { key: "steps", header: "Steps" }],
        rows: rows.slice(0, limit).map((row) => ({
          contract: `${row.contract.contractNumber} ${row.contract.title}`, rule: row.ruleName, submittedBy: person(row.requestedBy), submitted: day(row.requestedAt), outcome: words(row.status), hours: hours(row.requestedAt, row.completedAt),
          steps: row.steps.map((step) => `${step.name}: ${words(step.status)}${step.activatedAt && step.decidedAt ? ` in ${hours(step.activatedAt, step.decidedAt)} h` : ""}`).join("; "),
        })),
        summary: [
          { label: "Approved", value: String(rows.slice(0, limit).filter((row) => row.status === "APPROVED").length) },
          { label: "Rejected or changes requested", value: String(rows.slice(0, limit).filter((row) => row.status === "REJECTED" || row.status === "CHANGES_REQUESTED").length) },
          { label: "Pending", value: String(rows.slice(0, limit).filter((row) => row.status === "PENDING").length) },
          { label: "Average hours to decision", value: average === null ? "No decisions" : String(average) },
        ],
      };
    },
  },
};

export type ContractReportKey = keyof typeof CONTRACT_REPORTS;
export const isContractReportKey = (value: string): value is ContractReportKey => Object.hasOwn(CONTRACT_REPORTS, value);

/** Default window: the last or next 12 months depending on the report. */
export function reportFilters(key: ContractReportKey, input: ReportFilters): ResolvedReportFilters {
  const now = new Date();
  const definition = CONTRACT_REPORTS[key];
  const days = input.days && [30, 60, 90, 180, 365].includes(input.days) ? input.days : 90;
  const future = definition.dateRange === "future";
  const from = input.from ?? (future ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : new Date(now.getTime() - 365 * DAY));
  const to = input.to ? new Date(input.to.getTime() + DAY - 1) : (future ? new Date(now.getTime() + 365 * DAY) : now);
  return { from, to, days };
}

/**
 * Runs a report over contracts the actor can see. Financial columns and
 * financial-only reports need contracts.view_financials.
 */
export async function runContractReport(actor: ContractActor, key: ContractReportKey, input: ReportFilters = {}, limit = 500): Promise<ReportResult> {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const definition = CONTRACT_REPORTS[key];
  const financial = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  if (definition.financialOnly && !financial) throw new ContractForbiddenError("This report needs contract financial access.");
  const subject = await accessSubject(actor);
  const visible: Prisma.ContractWhereInput = { AND: [{ organizationId: actor.organizationId }, accessWhere(subject)] };
  const result = await definition.build(actor, visible, reportFilters(key, input), limit);
  const columns = result.columns.filter((column) => financial || !column.financial);
  const keys = new Set(columns.map((column) => column.key));
  return {
    columns,
    rows: result.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => keys.has(column)))),
    summary: result.summary,
    truncated: result.truncated ?? false,
  };
}
