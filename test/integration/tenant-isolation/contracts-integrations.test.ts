import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  addContractLink,
  assessContracts,
  generateBillingPlan,
  getBillingSchedule,
  getContractLinks,
  getContractRisk,
  markBillingLineInvoiced,
  removeContractLink,
  updateRiskSettings,
  addBillingLine,
  cancelBillingLine,
} from "@/modules/contracts/integrations";
import { createObligation } from "@/modules/contracts/lifecycle";
import { runContractReport } from "@/modules/contracts/reports";
import {
  changeContractStatus,
  CONTRACT_PERMISSION_KEYS,
  ContractForbiddenError,
  ContractNotFoundError,
  createContract,
  type ContractActor,
  type ContractInput,
} from "@/modules/contracts/service";
import { testDb } from "../setup/db";
import { addSecondTestMember, cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;
let orgB: TestOrg;
let ownerA: ContractActor;
let editorA: ContractActor;
let viewerA: ContractActor;
let ownerB: ContractActor;

const ALL = [...CONTRACT_PERMISSION_KEYS];
const ALL_MODULES = ["accounting", "fleet", "hr", "projects"];
const DAY = 86_400_000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const inDays = (days: number) => new Date(today().getTime() + days * DAY);
const run = `${Date.now()}`;

const input = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  title: "Vehicle lease", counterpartyName: "Kumasi Haulage", currency: "USD", value: "24000.00", renewalType: "MANUAL_RENEWAL",
  riskLevel: "LOW", confidentiality: "STANDARD", startDate: inDays(-10), expirationDate: inDays(355), ...overrides,
});

async function invoice(org: TestOrg, overrides: Partial<Prisma.AccountingInvoiceUncheckedCreateInput> = {}) {
  return testDb.accountingInvoice.create({ data: { organizationId: org.organizationId, invoiceNumber: `INV-${run}-${Math.random().toString(36).slice(2, 8)}`, customerName: "Kumasi Haulage", amount: new Prisma.Decimal("2000.00"), issueDate: today(), dueDate: inDays(30), status: "SENT", currency: "USD", ...overrides } });
}

beforeAll(async () => {
  orgA = await createTestOrg("contract-int-a");
  orgB = await createTestOrg("contract-int-b");
  const editor = await addSecondTestMember(orgA, "contract-int-editor");
  const viewer = await addSecondTestMember(orgA, "contract-int-viewer");
  const role = await testDb.role.findFirstOrThrow({ where: { organizationId: null, name: "Organization Owner" } });
  ownerA = { organizationId: orgA.organizationId, userId: orgA.userId, roleId: role.id, permissions: ALL };
  editorA = { organizationId: orgA.organizationId, userId: editor.userId, roleId: null, permissions: ALL.filter((key) => key !== PERMISSIONS.CONTRACTS_VIEW_FINANCIALS) };
  viewerA = { organizationId: orgA.organizationId, userId: viewer.userId, roleId: null, permissions: [PERMISSIONS.CONTRACTS_VIEW] };
  ownerB = { organizationId: orgB.organizationId, userId: orgB.userId, roleId: role.id, permissions: ALL };
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("linked records (real Postgres)", () => {
  it("links records only within the organization and only from modules the user can access", async () => {
    const contract = await createContract(ownerA, input());
    const vehicle = await testDb.fleetVehicle.create({ data: { organizationId: orgA.organizationId, assetTag: `AT-${run}`, plateNumber: `GR-${run.slice(-6)}` } });
    const foreignVehicle = await testDb.fleetVehicle.create({ data: { organizationId: orgB.organizationId, assetTag: `AT-B-${run}`, plateNumber: `GB-${run.slice(-6)}` } });
    await expect(addContractLink(ownerA, contract.id, { linkType: "FLEET_VEHICLE", entityId: foreignVehicle.id }, ALL_MODULES)).rejects.toThrow(ContractNotFoundError);
    await expect(addContractLink(ownerA, contract.id, { linkType: "FLEET_VEHICLE", entityId: vehicle.id }, ["accounting"])).rejects.toThrow(ContractForbiddenError);
    await expect(addContractLink(viewerA, contract.id, { linkType: "FLEET_VEHICLE", entityId: vehicle.id }, ALL_MODULES)).rejects.toThrow(ContractForbiddenError);
    await expect(addContractLink(ownerB, contract.id, { linkType: "FLEET_VEHICLE", entityId: foreignVehicle.id }, ALL_MODULES)).rejects.toThrow(ContractNotFoundError);
    await addContractLink(ownerA, contract.id, { linkType: "FLEET_VEHICLE", entityId: vehicle.id }, ALL_MODULES);
    await expect(addContractLink(ownerA, contract.id, { linkType: "FLEET_VEHICLE", entityId: vehicle.id }, ALL_MODULES)).rejects.toThrow(/already linked/);
    const visible = await getContractLinks(ownerA, contract.id, ALL_MODULES);
    expect(visible).toEqual([expect.objectContaining({ linkType: "FLEET_VEHICLE", label: vehicle.plateNumber, visible: true, href: "/app/fleet/vehicles" })]);
    // Someone without Fleet access sees that a link exists, not the vehicle.
    const hidden = await getContractLinks(viewerA, contract.id, ["accounting"]);
    expect(hidden).toEqual([expect.objectContaining({ visible: false, label: "Linked vehicle", detail: null, href: null })]);
    await removeContractLink(ownerA, contract.id, visible[0].id);
    expect(await getContractLinks(ownerA, contract.id, ALL_MODULES)).toEqual([]);
  }, 60_000);

  it("shows invoice amounts only to users with financial access", async () => {
    const contract = await createContract(ownerA, input({ title: "Invoice link" }));
    const doc = await invoice(orgA);
    await addContractLink(ownerA, contract.id, { linkType: "ACCOUNTING_INVOICE", entityId: doc.id }, ALL_MODULES);
    expect((await getContractLinks(ownerA, contract.id, ALL_MODULES))[0].financial).toMatchObject({ amount: "2000.00", currency: "USD", status: "SENT" });
    expect((await getContractLinks(editorA, contract.id, ALL_MODULES))[0].financial).toBeNull();
  }, 60_000);
});

describe("billing schedule (real Postgres)", () => {
  it("plans lines in the contract currency until expiration and needs financial access", async () => {
    const contract = await createContract(ownerA, input({ title: "Quarterly service", expirationDate: inDays(300) }));
    await expect(generateBillingPlan(editorA, contract.id, { direction: "RECEIVABLE", frequencyMonths: 3, amount: "6000", firstDueDate: inDays(5), description: "Service fee" })).rejects.toThrow(ContractForbiddenError);
    await expect(generateBillingPlan(ownerA, contract.id, { direction: "RECEIVABLE", frequencyMonths: 3, amount: "0", firstDueDate: inDays(5), description: "Service fee" })).rejects.toThrow(/greater than zero/);
    const { lines } = await generateBillingPlan(ownerA, contract.id, { direction: "RECEIVABLE", frequencyMonths: 3, amount: "6000", firstDueDate: inDays(5), description: "Service fee" });
    expect(lines).toBe(4);
    const schedule = await getBillingSchedule(ownerA, contract.id);
    expect(schedule.lines.every((line) => line.currency === "USD" && line.amount.toFixed(2) === "6000.00")).toBe(true);
    expect(schedule.totals.RECEIVABLE).toEqual({ planned: "24000.00", invoiced: "0.00" });
    await expect(getBillingSchedule(editorA, contract.id)).rejects.toThrow(ContractForbiddenError);
    const openEnded = await createContract(ownerA, input({ title: "Open ended", expirationDate: null }));
    await expect(generateBillingPlan(ownerA, openEnded.id, { direction: "PAYABLE", frequencyMonths: 1, amount: "100", firstDueDate: inDays(1), description: "Fee" })).rejects.toThrow(/number of periods/);
    expect((await generateBillingPlan(ownerA, openEnded.id, { direction: "PAYABLE", frequencyMonths: 1, amount: "100", firstDueDate: inDays(1), description: "Fee", periods: 6 })).lines).toBe(6);
  }, 60_000);

  it("marks a line invoiced only with an issued invoice in the same currency and organization, used once", async () => {
    const contract = await createContract(ownerA, input({ title: "Invoiced lease" }));
    const line = await addBillingLine(ownerA, contract.id, { direction: "RECEIVABLE", dueDate: inDays(10), amount: "2000", description: "Month 1" });
    const second = await addBillingLine(ownerA, contract.id, { direction: "RECEIVABLE", dueDate: inDays(40), amount: "2000", description: "Month 2" });
    const payable = await addBillingLine(ownerA, contract.id, { direction: "PAYABLE", dueDate: inDays(10), amount: "500", description: "Insurance" });
    const draft = await invoice(orgA, { status: "DRAFT" });
    const ghs = await invoice(orgA, { currency: "GHS" });
    const foreign = await invoice(orgB);
    const good = await invoice(orgA);
    await expect(markBillingLineInvoiced(ownerA, line.id, draft.id)).rejects.toThrow(/draft or void/);
    await expect(markBillingLineInvoiced(ownerA, line.id, ghs.id)).rejects.toThrow(/GHS/);
    await expect(markBillingLineInvoiced(ownerA, line.id, foreign.id)).rejects.toThrow(ContractNotFoundError);
    await expect(markBillingLineInvoiced(ownerA, payable.id, good.id)).rejects.toThrow(/Bill not found/);
    await expect(markBillingLineInvoiced(ownerB, line.id, good.id)).rejects.toThrow(ContractNotFoundError);
    await markBillingLineInvoiced(ownerA, line.id, good.id);
    await expect(markBillingLineInvoiced(ownerA, second.id, good.id)).rejects.toThrow(/already settles/);
    const schedule = await getBillingSchedule(ownerA, contract.id);
    expect(schedule.totals.RECEIVABLE).toEqual({ planned: "2000.00", invoiced: "2000.00" });
    // The invoice is linked to the contract and is untouched.
    const links = await getContractLinks(ownerA, contract.id, ALL_MODULES);
    expect(links.map((link) => link.linkType)).toContain("ACCOUNTING_INVOICE");
    expect((await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: good.id } })).amountPaid.toFixed(2)).toBe("0.00");
    // Planning and linking never post to the ledger.
    expect(await testDb.accountingJournalEntry.count({ where: { organizationId: orgA.organizationId } })).toBe(0);
    // A linked document cannot be unlinked while a line relies on it.
    const invoiceLink = links.find((link) => link.linkType === "ACCOUNTING_INVOICE")!;
    await expect(removeContractLink(ownerA, contract.id, invoiceLink.id)).rejects.toThrow(/billing line/);
    await expect(cancelBillingLine(ownerA, line.id, "Mistake")).rejects.toThrow(/planned/);
    await cancelBillingLine(ownerA, second.id, "Deferred");
  }, 60_000);
});

describe("calculated risk (real Postgres)", () => {
  it("scores contracts from their documents, signatures, obligations, and the organization's settings", async () => {
    await updateRiskSettings(ownerA, { weights: { overdueObligations: 30 }, thresholds: { USD: "20000" } });
    await expect(updateRiskSettings(ownerA, { weights: { overdueObligations: 80 }, thresholds: {} })).rejects.toThrow(/0 to 50/);
    await expect(updateRiskSettings(viewerA, { weights: {}, thresholds: {} })).rejects.toThrow(ContractForbiddenError);
    const contract = await changeContractStatus(ownerA, (await createContract(ownerA, input({ title: "Risky" }))).id, "ACTIVATE");
    await createObligation(ownerA, contract.id, { title: "Late report", obligationType: "REPORTING", responsibleParty: "COUNTERPARTY", dueDate: inDays(-3), recurrence: "NONE" });
    const risk = await getContractRisk(ownerA, contract.id);
    expect(risk.factors.map((factor) => factor.key).sort()).toEqual(["highValue", "noPrimaryDocument", "overdueObligations", "unsignedActive"]);
    expect(risk.score).toBe(15 + 10 + 30 + 5);
    expect(risk.band).toBe("HIGH");
    // Without financial access the value factor is not described.
    expect((await getContractRisk(editorA, contract.id)).factors.find((factor) => factor.key === "highValue")?.label).toBe("Financial factor");
    const batch = await assessContracts(orgA.organizationId, [contract]);
    expect(batch.get(contract.id)?.score).toBe(risk.score);
  }, 60_000);
});

describe("reports (real Postgres)", () => {
  it("includes only contracts the user can see and hides financial columns without financial access", async () => {
    await createContract(ownerA, input({ title: "Hidden register entry", confidentiality: "CONFIDENTIAL" }));
    const owner = await runContractReport(ownerA, "register");
    const viewer = await runContractReport(viewerA, "register");
    expect(owner.rows.map((row) => row.title)).toContain("Hidden register entry");
    expect(viewer.rows.map((row) => row.title)).not.toContain("Hidden register entry");
    expect(owner.columns.map((column) => column.key)).toContain("value");
    expect(viewer.columns.map((column) => column.key)).not.toContain("value");
    expect(viewer.rows.every((row) => !("value" in row))).toBe(true);
    await expect(runContractReport(viewerA, "counterparty")).rejects.toThrow(ContractForbiddenError);
    await expect(runContractReport(viewerA, "billing")).rejects.toThrow(ContractForbiddenError);
    // Another organization's report never includes these contracts.
    expect((await runContractReport(ownerB, "register")).rows.map((row) => row.title)).not.toContain("Vehicle lease");
  }, 60_000);

  it("keeps currencies separate in exposure and billing totals", async () => {
    const ghs = await changeContractStatus(ownerA, (await createContract(ownerA, input({ title: "Cedi lease", counterpartyName: "Kumasi Haulage", currency: "GHS", value: "50000.00" }))).id, "ACTIVATE");
    await changeContractStatus(ownerA, (await createContract(ownerA, input({ title: "Dollar lease", counterpartyName: "Kumasi Haulage", value: "1000.00" }))).id, "ACTIVATE");
    await addBillingLine(ownerA, ghs.id, { direction: "RECEIVABLE", dueDate: inDays(15), amount: "4000", description: "Cedi fee" });
    const exposure = await runContractReport(ownerA, "counterparty");
    const rows = exposure.rows.filter((row) => row.counterparty === "Kumasi Haulage");
    expect(rows.map((row) => row.currency).sort()).toEqual(["GHS", "USD"]);
    expect(rows.find((row) => row.currency === "GHS")).toMatchObject({ value: "50000.00", receivable: "4000.00" });
    const billing = await runContractReport(ownerA, "billing");
    expect(billing.summary.map((item) => item.label)).toEqual(expect.arrayContaining(["To invoice (GHS)", "To invoice (USD)"]));
    const forecast = await runContractReport(ownerA, "renewal-forecast");
    expect(forecast.rows.every((row) => typeof row.currency === "string")).toBe(true);
  }, 60_000);
});
