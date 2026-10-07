import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  addContractComment,
  applyAmendment,
  createAmendment,
  createApprovalRule,
  createMilestone,
  createObligation,
  decideApprovalStep,
  listMyPendingApprovals,
  listObligations,
  reassignApprovalStep,
  recordExternalSignature,
  recordNonRenewal,
  renewContract,
  requestInternalAcknowledgement,
  respondToAcknowledgement,
  setApprovalRuleActive,
  submitContractForApproval,
  terminateContract,
  updateObligationStatus,
  withdrawApprovalRequest,
} from "@/modules/contracts/lifecycle";
import { runContractReminders } from "@/modules/contracts/reminders";
import { addMonths } from "@/modules/contracts/rules";
import {
  addContractParty,
  changeContractStatus,
  CONTRACT_PERMISSION_KEYS,
  ContractError,
  ContractForbiddenError,
  ContractNotFoundError,
  createContract,
  getContractDetail,
  updateContract,
  updateContractSettings,
  uploadContractDocument,
  type ContractActor,
  type ContractInput,
} from "@/modules/contracts/service";
import { testDb } from "../setup/db";
import { addSecondTestMember, cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;
let orgB: TestOrg;
let ownerA: ContractActor;
let legalA: ContractActor;
let financeA: ContractActor;
let viewerA: ContractActor;
let ownerB: ContractActor;

const ALL = [...CONTRACT_PERMISSION_KEYS];
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
const DAY = 86_400_000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const inDays = (days: number) => new Date(today().getTime() + days * DAY);

const input = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  title: "Fuel supply", counterpartyName: "Tema Fuels Ltd", currency: "GHS", value: "80000.00", renewalType: "MANUAL_RENEWAL",
  riskLevel: "MEDIUM", confidentiality: "STANDARD", startDate: inDays(-30), expirationDate: inDays(335), noticePeriodDays: 30, ...overrides,
});

/** Creates and activates a contract that no approval rule applies to (value in USD). */
async function activeContract(overrides: Partial<ContractInput> = {}) {
  const contract = await createContract(ownerA, input({ currency: "USD", ...overrides }));
  return changeContractStatus(ownerA, contract.id, "ACTIVATE");
}

beforeAll(async () => {
  orgA = await createTestOrg("contract-life-a");
  orgB = await createTestOrg("contract-life-b");
  const legal = await addSecondTestMember(orgA, "contract-life-legal");
  const finance = await addSecondTestMember(orgA, "contract-life-finance");
  const viewer = await addSecondTestMember(orgA, "contract-life-viewer");
  const ownerRole = await testDb.role.findFirstOrThrow({ where: { organizationId: null, name: "Organization Owner" } });
  const financeRole = await testDb.role.create({ data: { organizationId: orgA.organizationId, name: `Finance approvers ${Date.now()}` } });
  await testDb.organizationMember.update({ where: { id: finance.membershipId }, data: { roleId: financeRole.id } });
  ownerA = { organizationId: orgA.organizationId, userId: orgA.userId, roleId: ownerRole.id, permissions: ALL };
  legalA = { organizationId: orgA.organizationId, userId: legal.userId, roleId: ownerRole.id, permissions: ALL };
  financeA = { organizationId: orgA.organizationId, userId: finance.userId, roleId: financeRole.id, permissions: [PERMISSIONS.CONTRACTS_VIEW, PERMISSIONS.CONTRACTS_APPROVE] };
  viewerA = { organizationId: orgA.organizationId, userId: viewer.userId, roleId: null, permissions: [PERMISSIONS.CONTRACTS_VIEW] };
  ownerB = { organizationId: orgB.organizationId, userId: orgB.userId, roleId: ownerRole.id, permissions: ALL };
  // GHS contracts of 50,000 or more need Legal, then Finance (by role).
  await createApprovalRule(ownerA, { name: "High-value GHS", priority: 10, minValue: "50000", currency: "GHS", steps: [{ name: "Legal review", approverUserId: legal.userId }, { name: "Finance approval", approverRoleId: financeRole.id }] });
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("approval rules and workflow (real Postgres)", () => {
  it("validates rules: value thresholds need a currency and approvers must belong to the organization", async () => {
    await expect(createApprovalRule(ownerA, { name: "No currency", minValue: "100", steps: [{ name: "A", approverUserId: ownerA.userId }] })).rejects.toThrow(/currency/);
    await expect(createApprovalRule(ownerA, { name: "Foreign approver", steps: [{ name: "A", approverUserId: orgB.userId }] })).rejects.toThrow(ContractNotFoundError);
    await expect(createApprovalRule(ownerA, { name: "No steps", steps: [] })).rejects.toThrow(/step/);
    await expect(createApprovalRule(viewerA, { name: "Viewer", steps: [{ name: "A", approverUserId: ownerA.userId }] })).rejects.toThrow(ContractForbiddenError);
  }, 60_000);

  it("blocks direct activation, locks the contract under approval, and runs the steps in order", async () => {
    const contract = await createContract(ownerA, input({ title: "Fleet fuel 2027" }));
    await expect(changeContractStatus(ownerA, contract.id, "ACTIVATE")).rejects.toThrow(/approval/);
    const request = await submitContractForApproval(ownerA, contract.id, "Please review by Friday");
    expect(request.steps.map((step) => step.status)).toEqual(["PENDING", "WAITING"]);
    expect((await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("PENDING_APPROVAL");
    await expect(updateContract(ownerA, contract.id, input({ title: "Changed while pending" }))).rejects.toThrow(/Withdraw/);
    await expect(addContractParty(ownerA, contract.id, { role: "VENDOR", name: "Late party" })).rejects.toThrow(/Withdraw/);
    // The legal approver was notified.
    expect(await testDb.notification.count({ where: { organizationId: orgA.organizationId, userId: legalA.userId, type: "CONTRACT_APPROVAL_REQUESTED", metadata: { path: ["contractId"], equals: contract.id } } })).toBe(1);
    // Only the current step's approver can decide; the requester cannot approve their own submission.
    await expect(decideApprovalStep(financeA, request.id, "APPROVE")).rejects.toThrow(ContractForbiddenError);
    await expect(decideApprovalStep(ownerA, request.id, "APPROVE")).rejects.toThrow(ContractForbiddenError);
    expect((await decideApprovalStep(legalA, request.id, "APPROVE", "Terms fine")).outcome).toBe("STEP_APPROVED");
    // The role step is now waiting for any member holding the role.
    expect((await listMyPendingApprovals(financeA)).map((step) => step.requestId)).toContain(request.id);
    await expect(decideApprovalStep(financeA, request.id, "REJECT")).rejects.toThrow(/reason/);
    expect((await decideApprovalStep(financeA, request.id, "APPROVE")).outcome).toBe("APPROVED");
    const approved = await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(approved.status).toBe("APPROVED");
    expect(await testDb.notification.count({ where: { userId: ownerA.userId, type: "CONTRACT_APPROVED", metadata: { path: ["contractId"], equals: contract.id } } })).toBe(1);
    const activated = await changeContractStatus(ownerA, contract.id, "ACTIVATE");
    expect(activated.status).toBe("ACTIVE");
    const audit = await testDb.auditLog.findMany({ where: { organizationId: orgA.organizationId, entityId: contract.id }, select: { action: true } });
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["contract.submitted_for_approval", "contract.approval_step_approved", "contract.approved", "contract.activated"]));
  }, 90_000);

  it("returns rejected and changed contracts to draft, and allows a new submission", async () => {
    const contract = await createContract(ownerA, input({ title: "Rejected then resubmitted" }));
    const first = await submitContractForApproval(ownerA, contract.id);
    await expect(submitContractForApproval(ownerA, contract.id)).rejects.toThrow(/draft/);
    await decideApprovalStep(legalA, first.id, "REQUEST_CHANGES", "Add a liability cap");
    expect((await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("DRAFT");
    expect((await testDb.contractApprovalStep.findMany({ where: { requestId: first.id }, orderBy: { stepOrder: "asc" } })).map((step) => step.status)).toEqual(["CHANGES_REQUESTED", "SKIPPED"]);
    await updateContract(ownerA, contract.id, input({ title: "Rejected then resubmitted", notes: "Liability capped" }));
    const second = await submitContractForApproval(ownerA, contract.id);
    await withdrawApprovalRequest(ownerA, second.id, "Pricing update coming");
    expect((await testDb.contractApprovalRequest.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("WITHDRAWN");
    // Approving, then changing the terms, resets the approval.
    const third = await submitContractForApproval(ownerA, contract.id);
    await decideApprovalStep(legalA, third.id, "APPROVE");
    await decideApprovalStep(financeA, third.id, "APPROVE");
    const changed = await updateContract(ownerA, contract.id, input({ title: "Rejected then resubmitted", value: "95000.00" }));
    expect(changed.status).toBe("DRAFT");
    await expect(changeContractStatus(ownerA, contract.id, "ACTIVATE")).rejects.toThrow(/approval/);
  }, 90_000);

  it("lets the assigned approver open a confidential contract only while the step is pending", async () => {
    const contract = await createContract(ownerA, input({ title: "Confidential settlement", confidentiality: "CONFIDENTIAL" }));
    await expect(getContractDetail(legalA, contract.id)).rejects.toThrow(ContractNotFoundError);
    const request = await submitContractForApproval(ownerA, contract.id);
    expect((await getContractDetail(legalA, contract.id)).contract.id).toBe(contract.id);
    await expect(getContractDetail(financeA, contract.id)).rejects.toThrow(ContractNotFoundError);
    await decideApprovalStep(legalA, request.id, "APPROVE");
    await expect(getContractDetail(legalA, contract.id)).rejects.toThrow(ContractNotFoundError);
    expect((await getContractDetail(financeA, contract.id)).contract.id).toBe(contract.id);
  }, 90_000);

  it("reassigns and escalates the current step, and never across organizations", async () => {
    const contract = await createContract(ownerA, input({ title: "Escalated" }));
    const request = await submitContractForApproval(ownerA, contract.id);
    const step = request.steps[0];
    await expect(reassignApprovalStep(legalA, step.id, { approverUserId: orgB.userId })).rejects.toThrow(ContractNotFoundError);
    await expect(reassignApprovalStep(legalA, step.id, { approverUserId: ownerA.userId })).rejects.toThrow(/submitted/);
    await reassignApprovalStep(legalA, step.id, { approverUserId: viewerA.userId, escalate: true, reason: "On leave" });
    const updated = await testDb.contractApprovalStep.findUniqueOrThrow({ where: { id: step.id } });
    expect(updated).toMatchObject({ approverUserId: viewerA.userId, escalated: true });
    // The new approver still needs approval permission to decide.
    await expect(decideApprovalStep(viewerA, request.id, "APPROVE")).rejects.toThrow(ContractForbiddenError);
    await expect(decideApprovalStep(ownerB, request.id, "APPROVE")).rejects.toThrow(ContractNotFoundError);
    await expect(withdrawApprovalRequest(ownerB, request.id)).rejects.toThrow(ContractNotFoundError);
    await addContractComment(viewerA, contract.id, "Looking at it now");
    expect(await testDb.contractComment.count({ where: { contractId: contract.id, approvalRequestId: request.id } })).toBeGreaterThanOrEqual(2);
  }, 90_000);

  it("activates contracts directly when no rule applies, and when a rule is deactivated", async () => {
    const usd = await createContract(ownerA, input({ currency: "USD", value: "900000.00" }));
    expect((await changeContractStatus(ownerA, usd.id, "ACTIVATE")).status).toBe("ACTIVE");
    const rule = await testDb.contractApprovalRule.findFirstOrThrow({ where: { organizationId: orgA.organizationId, name: "High-value GHS" } });
    await setApprovalRuleActive(ownerA, rule.id, false);
    const ghs = await createContract(ownerA, input({ title: "While rule inactive" }));
    expect((await changeContractStatus(ownerA, ghs.id, "ACTIVATE")).status).toBe("ACTIVE");
    await setApprovalRuleActive(ownerA, rule.id, true);
  }, 60_000);
});

describe("obligations and milestones (real Postgres)", () => {
  it("schedules the next occurrence of a recurring obligation and lets its owner complete it", async () => {
    const contract = await activeContract({ title: "Insurance-backed lease", expirationDate: inDays(200) });
    const obligation = await createObligation(ownerA, contract.id, { title: "Quarterly insurance certificate", obligationType: "INSURANCE", responsibleParty: "COUNTERPARTY", ownerId: viewerA.userId, dueDate: inDays(10), recurrence: "QUARTERLY" });
    // The owner can complete it without contract edit permission.
    const { next } = await updateObligationStatus(viewerA, obligation.id, "COMPLETE", "Certificate received");
    expect(next?.dueDate.toISOString()).toBe(addMonths(inDays(10), 3).toISOString());
    await expect(updateObligationStatus(viewerA, obligation.id, "COMPLETE")).rejects.toThrow(/closed/);
    // Occurrences stop at the contract's expiration date.
    const late = await createObligation(ownerA, contract.id, { title: "Annual audit", obligationType: "REPORTING", responsibleParty: "INTERNAL", dueDate: inDays(100), recurrence: "ANNUAL" });
    expect((await updateObligationStatus(ownerA, late.id, "COMPLETE")).next).toBeNull();
    await expect(updateObligationStatus(ownerA, late.id, "WAIVE")).rejects.toThrow(/closed/);
  }, 60_000);

  it("keeps obligations private to people who can see the contract and to the organization", async () => {
    const contract = await activeContract({ title: "Hidden obligations", confidentiality: "CONFIDENTIAL" });
    const obligation = await createObligation(ownerA, contract.id, { title: "Secret payment", obligationType: "PAYMENT", responsibleParty: "INTERNAL", dueDate: inDays(-2), recurrence: "NONE" });
    expect((await listObligations(ownerA, "overdue")).map((row) => row.id)).toContain(obligation.id);
    expect((await listObligations(viewerA, "all")).map((row) => row.id)).not.toContain(obligation.id);
    await expect(updateObligationStatus(viewerA, obligation.id, "COMPLETE")).rejects.toThrow(ContractNotFoundError);
    await expect(updateObligationStatus(ownerB, obligation.id, "COMPLETE")).rejects.toThrow(ContractNotFoundError);
    await expect(createObligation(ownerB, contract.id, { title: "Injected", obligationType: "OTHER", responsibleParty: "INTERNAL", dueDate: inDays(5), recurrence: "NONE" })).rejects.toThrow(ContractNotFoundError);
  }, 60_000);

  it("hides milestone amounts from users without financial access", async () => {
    const contract = await activeContract({ title: "Milestone contract" });
    await expect(createMilestone({ ...ownerA, permissions: ALL.filter((key) => key !== PERMISSIONS.CONTRACTS_VIEW_FINANCIALS) }, contract.id, { title: "Go-live", dueDate: inDays(20), amount: "5000" })).rejects.toThrow(ContractForbiddenError);
    const milestone = await createMilestone(ownerA, contract.id, { title: "Go-live", dueDate: inDays(20), amount: "5000.00" });
    expect(milestone.amount?.toFixed(2)).toBe("5000.00");
  }, 60_000);
});

describe("renewals, amendments, and termination (real Postgres)", () => {
  it("renews as a new version, rejects earlier dates, and records non-renewal", async () => {
    const contract = await activeContract({ title: "Renewable", expirationDate: inDays(40), renewalTermMonths: 12 });
    await expect(renewContract(ownerA, contract.id, { newExpirationDate: inDays(20) })).rejects.toThrow(/after/);
    await expect(renewContract({ ...ownerA, permissions: ALL.filter((key) => key !== PERMISSIONS.CONTRACTS_VIEW_FINANCIALS) }, contract.id, { newExpirationDate: inDays(400), newValue: "1" })).rejects.toThrow(ContractForbiddenError);
    const renewal = await renewContract(ownerA, contract.id, { newExpirationDate: inDays(405), newValue: "88000.00", reason: "Annual renewal" });
    const renewed = await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(renewed.expirationDate?.toISOString()).toBe(inDays(405).toISOString());
    expect(renewed.value?.toFixed(2)).toBe("88000.00");
    expect(renewal.contractVersion).toBe(renewed.currentVersion);
    expect(renewal.previousValue?.toFixed(2)).toBe("80000.00");
    await recordNonRenewal(ownerA, contract.id, { reason: "Switching supplier", noticeGivenAt: today() });
    expect((await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } })).renewalType).toBe("NO_RENEWAL");
  }, 60_000);

  it("applies amendments as new versions with a second person, never on drafts", async () => {
    const draft = await createContract(ownerA, input({ currency: "USD" }));
    await expect(createAmendment(ownerA, draft.id, { title: "Too early", reason: "Draft", changes: { title: "x" } })).rejects.toThrow(/approved or active/);
    const contract = await activeContract({ title: "Amendable" });
    await expect(createAmendment(ownerA, contract.id, { title: "Nothing", reason: "Empty", changes: {} })).rejects.toThrow(/at least one/);
    await expect(createAmendment({ ...ownerA, permissions: ALL.filter((key) => key !== PERMISSIONS.CONTRACTS_VIEW_FINANCIALS) }, contract.id, { title: "Price", reason: "Price", changes: { value: "1.00" } })).rejects.toThrow(ContractForbiddenError);
    const amendment = await createAmendment(ownerA, contract.id, { title: "Extension and price review", reason: "Agreed at quarterly review", changes: { expirationDate: inDays(500).toISOString().slice(0, 10), value: "95000.00" } });
    expect(amendment.amendmentNumber).toBe(1);
    await expect(applyAmendment(ownerA, amendment.id)).rejects.toThrow(/someone else/);
    await expect(applyAmendment(ownerB, amendment.id)).rejects.toThrow(ContractNotFoundError);
    const before = await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } });
    const { version } = await applyAmendment(legalA, amendment.id);
    const after = await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(version).toBe(before.currentVersion + 1);
    expect(after.value?.toFixed(2)).toBe("95000.00");
    const recorded = await testDb.contractVersion.findUniqueOrThrow({ where: { contractId_version: { contractId: contract.id, version } } });
    expect(recorded.reason).toBe("Amendment 1: Extension and price review");
    expect(recorded.changedFields.sort()).toEqual(["expirationDate", "value"]);
    // Earlier versions are untouched.
    const original = await testDb.contractVersion.findUniqueOrThrow({ where: { contractId_version: { contractId: contract.id, version: 1 } } });
    expect((original.snapshot as { value: string }).value).toBe("80000.00");
    await expect(applyAmendment(legalA, amendment.id)).rejects.toThrow(/already/);
  }, 60_000);

  it("requires acknowledgement of short notice and closes future obligations on termination", async () => {
    const contract = await activeContract({ title: "Terminated early", noticePeriodDays: 30 });
    const future = await createObligation(ownerA, contract.id, { title: "Future delivery", obligationType: "DELIVERABLE", responsibleParty: "COUNTERPARTY", dueDate: inDays(60), recurrence: "NONE" });
    const past = await createObligation(ownerA, contract.id, { title: "Earlier delivery", obligationType: "DELIVERABLE", responsibleParty: "COUNTERPARTY", dueDate: inDays(5), recurrence: "NONE" });
    await createMilestone(ownerA, contract.id, { title: "Phase 2", dueDate: inDays(90) });
    await expect(terminateContract(viewerA, contract.id, { effectiveDate: inDays(10), reason: "x" })).rejects.toThrow(ContractForbiddenError);
    await expect(terminateContract(ownerA, contract.id, { effectiveDate: inDays(10), noticeGivenAt: today(), reason: "Supplier breach" })).rejects.toThrow(/20 days shorter/);
    const result = await terminateContract(ownerA, contract.id, { effectiveDate: inDays(10), noticeGivenAt: today(), reason: "Supplier breach", acknowledgeShortNotice: true });
    expect(result).toMatchObject({ shortNoticeDays: 20, obligationsWaived: 1 });
    const terminated = await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(terminated).toMatchObject({ status: "TERMINATED", terminationReason: "Supplier breach" });
    expect((await testDb.contractObligation.findUniqueOrThrow({ where: { id: future.id } })).status).toBe("WAIVED");
    expect((await testDb.contractObligation.findUniqueOrThrow({ where: { id: past.id } })).status).toBe("OPEN");
    expect(await testDb.contractMilestone.count({ where: { contractId: contract.id, status: "CANCELLED" } })).toBe(1);
    await expect(terminateContract(ownerA, contract.id, { effectiveDate: inDays(10), reason: "Again" })).rejects.toThrow(/active/);
    await expect(updateContract(ownerA, contract.id, input({ title: "After termination" }), "reason")).rejects.toThrow(ContractError);
  }, 60_000);
});

describe("signatures and acknowledgements (real Postgres)", () => {
  it("records acknowledgements only from the requested person and external signatures with evidence", async () => {
    const contract = await activeContract({ title: "Signed contract", confidentiality: "CONFIDENTIAL" });
    const document = await uploadContractDocument(ownerA, contract.id, { documentType: "PRIMARY", title: "Signed copy", fileName: "signed.pdf", mimeType: "application/pdf", bytes: PDF });
    const request = await requestInternalAcknowledgement(ownerA, contract.id, { signerUserId: viewerA.userId, documentId: document.id });
    // The pending signer can open the confidential contract to review it.
    expect((await getContractDetail(viewerA, contract.id)).contract.id).toBe(contract.id);
    await expect(respondToAcknowledgement(legalA, request.id, "ACKNOWLEDGE")).rejects.toThrow(ContractNotFoundError);
    await respondToAcknowledgement(viewerA, request.id, "ACKNOWLEDGE", "Reviewed");
    expect((await testDb.contractSignature.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SIGNED");
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { organizationId: orgA.organizationId, entityId: contract.id, action: "contract.acknowledged" } });
    expect((audit.changes as { documentChecksumSha256: string }).documentChecksumSha256).toBe(document.checksumSha256);
    await expect(getContractDetail(viewerA, contract.id)).rejects.toThrow(ContractNotFoundError);
    const foreign = await activeContract({ title: "Other contract" });
    await expect(recordExternalSignature(ownerA, foreign.id, { signerName: "K. Mensah", signedAt: today(), documentId: document.id })).rejects.toThrow(/Document not found/);
    await expect(recordExternalSignature(ownerA, contract.id, { signerName: "K. Mensah", signedAt: inDays(2) })).rejects.toThrow(/future/);
    const recorded = await recordExternalSignature(ownerA, contract.id, { signerName: "K. Mensah", signerTitle: "Director", signedAt: today(), documentId: document.id, evidenceNote: "Wet ink original filed" });
    expect(recorded).toMatchObject({ method: "RECORDED_EXTERNAL", status: "SIGNED" });
    await expect(requestInternalAcknowledgement(ownerA, contract.id, { signerUserId: orgB.userId })).rejects.toThrow(ContractNotFoundError);
  }, 60_000);
});

describe("scheduled reminders (real Postgres)", () => {
  it("sends each reminder band once, to the owner, and skips closed contracts", async () => {
    await updateContractSettings(ownerA, { numberFormat: "{PREFIX}/{YYYY}/{SEQ:6}", numberPrefix: "CTR", resetSequenceYearly: true, expiryAlertDays: [30, 7], confidentialAdminAccess: false, obligationReminderDays: [3] });
    const expiring = await activeContract({ title: "Expiring soon", expirationDate: inDays(10), startDate: inDays(-300) });
    const obligationContract = await activeContract({ title: "Has overdue obligation" });
    const overdue = await createObligation(ownerA, obligationContract.id, { title: "Monthly report", obligationType: "REPORTING", responsibleParty: "INTERNAL", ownerId: legalA.userId, dueDate: inDays(-1), recurrence: "NONE" });
    const closed = await activeContract({ title: "Terminated, no reminders", expirationDate: inDays(5), startDate: inDays(-300), noticePeriodDays: 0 });
    await terminateContract(ownerA, closed.id, { effectiveDate: today(), noticeGivenAt: today(), reason: "Closed" });

    const first = await runContractReminders(new Date());
    expect(first.sent).toBeGreaterThanOrEqual(2);
    const expiryReminders = await testDb.contractReminder.findMany({ where: { organizationId: orgA.organizationId, targetId: expiring.id, kind: "EXPIRY" } });
    expect(expiryReminders.map((row) => row.thresholdDays)).toEqual([30]);
    expect(await testDb.notification.count({ where: { userId: ownerA.userId, type: "CONTRACT_EXPIRY_REMINDER", metadata: { path: ["contractId"], equals: expiring.id } } })).toBe(1);
    expect(await testDb.notification.count({ where: { userId: legalA.userId, type: "CONTRACT_OBLIGATION_REMINDER", metadata: { path: ["targetId"], equals: overdue.id } } })).toBe(1);
    expect(await testDb.contractReminder.count({ where: { contractId: closed.id } })).toBe(0);

    // A second run sends nothing new for the same bands.
    await runContractReminders(new Date());
    expect(await testDb.notification.count({ where: { userId: ownerA.userId, type: "CONTRACT_EXPIRY_REMINDER", metadata: { path: ["contractId"], equals: expiring.id } } })).toBe(1);
    expect(await testDb.notification.count({ where: { userId: legalA.userId, type: "CONTRACT_OBLIGATION_REMINDER", metadata: { path: ["targetId"], equals: overdue.id } } })).toBe(1);

    // Three days later the 7-day band is reached and sent once.
    await runContractReminders(new Date(Date.now() + 3 * DAY));
    expect((await testDb.contractReminder.findMany({ where: { targetId: expiring.id, kind: "EXPIRY" }, orderBy: { thresholdDays: "desc" } })).map((row) => row.thresholdDays)).toEqual([30, 7]);
    // Other organizations' users never receive these notifications.
    expect(await testDb.notification.count({ where: { organizationId: orgB.organizationId, type: { startsWith: "CONTRACT_" } } })).toBe(0);
  }, 120_000);
});
