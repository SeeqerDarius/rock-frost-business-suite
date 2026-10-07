import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { canViewContract, ContractRuleError, daysUntil, diffContract, formatContractNumber, formatUsesYear, listTemplateVariables, redactFinancials, renderTemplate, validateNumberFormat, type AccessSubject } from "@/modules/contracts/rules";

describe("contract numbering", () => {
  it("formats the default pattern with a padded sequence", () => {
    expect(formatContractNumber("{PREFIX}/{YYYY}/{SEQ:6}", "CTR", { year: 2026, month: 10 }, 1)).toBe("CTR/2026/000001");
    expect(formatContractNumber("{PREFIX}-{YY}{MM}-{SEQ:4}", "LEASE", { year: 2026, month: 3 }, 42)).toBe("LEASE-2603-0042");
    expect(formatContractNumber("C{SEQ}", "X", { year: 2026, month: 1 }, 1234567)).toBe("C1234567");
  });

  it("requires a sequence token and rejects unknown tokens", () => {
    expect(() => validateNumberFormat("{PREFIX}/{YYYY}")).toThrow(ContractRuleError);
    expect(() => validateNumberFormat("{PREFIX}/{DAY}/{SEQ:4}")).toThrow(ContractRuleError);
    expect(() => validateNumberFormat("{PREFIX}/{YYYY}/{SEQ:6}")).not.toThrow();
    expect(formatUsesYear("{PREFIX}/{SEQ:6}")).toBe(false);
    expect(formatUsesYear("{PREFIX}/{YY}/{SEQ:6}")).toBe(true);
  });
});

describe("template rendering", () => {
  it("fills known variables and leaves missing ones visible", () => {
    const body = "Between {{organization.name}} and {{counterparty.name}} from {{contract.startDate}} for {{ contract.value }} {{contract.currency}}.";
    const result = renderTemplate(body, { "organization.name": "Rock Frost", "counterparty.name": "Acme", "contract.startDate": "2026-11-01", "contract.currency": "USD" });
    expect(result.text).toBe("Between Rock Frost and Acme from 2026-11-01 for {{ contract.value }} USD.");
    expect(result.missing).toEqual(["contract.value"]);
    expect(listTemplateVariables(body)).toEqual(["organization.name", "counterparty.name", "contract.startDate", "contract.value", "contract.currency"]);
  });

  it("does not interpret anything but simple dotted names", () => {
    expect(renderTemplate("{{constructor}} {{__proto__}} {{a.b}}", { "a.b": "ok" }).text).toBe("{{constructor}} {{__proto__}} ok");
  });
});

describe("confidentiality", () => {
  const subject = (overrides: Partial<AccessSubject> = {}): AccessSubject => ({ userId: "u1", roleId: "r1", department: "Legal", canViewConfidential: false, confidentialAdminAccess: false, ...overrides });
  const target = { ownerId: "owner", createdById: "creator", grants: [] as { userId: string | null; roleId: string | null; department: string | null }[] };

  it("shows standard contracts to anyone with contract access", () => {
    expect(canViewContract(subject(), { ...target, confidentiality: "STANDARD" })).toBe(true);
  });

  it("limits confidential contracts to the owner, creator, and explicit grants", () => {
    expect(canViewContract(subject(), { ...target, confidentiality: "CONFIDENTIAL" })).toBe(false);
    expect(canViewContract(subject({ userId: "owner" }), { ...target, confidentiality: "CONFIDENTIAL" })).toBe(true);
    expect(canViewContract(subject({ userId: "creator" }), { ...target, confidentiality: "RESTRICTED" })).toBe(true);
    expect(canViewContract(subject(), { ...target, confidentiality: "CONFIDENTIAL", grants: [{ userId: "u1", roleId: null, department: null }] })).toBe(true);
    expect(canViewContract(subject(), { ...target, confidentiality: "CONFIDENTIAL", grants: [{ userId: null, roleId: "r1", department: null }] })).toBe(true);
    expect(canViewContract(subject(), { ...target, confidentiality: "RESTRICTED", grants: [{ userId: null, roleId: null, department: "legal" }] })).toBe(true);
    expect(canViewContract(subject({ department: null }), { ...target, confidentiality: "RESTRICTED", grants: [{ userId: null, roleId: null, department: "Legal" }] })).toBe(false);
  });

  it("does not let an administrator permission alone open confidential contracts", () => {
    expect(canViewContract(subject({ canViewConfidential: true }), { ...target, confidentiality: "CONFIDENTIAL" })).toBe(false);
    expect(canViewContract(subject({ canViewConfidential: true, confidentialAdminAccess: true }), { ...target, confidentiality: "CONFIDENTIAL" })).toBe(true);
    // Restricted contracts always need an explicit grant.
    expect(canViewContract(subject({ canViewConfidential: true, confidentialAdminAccess: true }), { ...target, confidentiality: "RESTRICTED" })).toBe(false);
  });
});

describe("change tracking", () => {
  it("reports only fields that changed, normalizing dates, decimals, and tags", () => {
    const before = { title: "Lease", value: new Prisma.Decimal("1000"), expirationDate: new Date("2027-01-01T00:00:00Z"), tags: ["b", "a"], notes: null };
    const after = { title: "Lease", value: new Prisma.Decimal("1000.00"), expirationDate: new Date("2027-06-30T00:00:00Z"), tags: ["a", "b"], notes: "" };
    expect(diffContract(before, after)).toEqual({ expirationDate: { from: "2027-01-01T00:00:00.000Z", to: "2027-06-30T00:00:00.000Z" } });
  });

  it("hides financial changes from users without financial access", () => {
    const changes = { value: { from: "1", to: "2" }, title: { from: "a", to: "b" } };
    expect(redactFinancials(changes, false)).toEqual({ value: { from: "hidden", to: "hidden" }, title: { from: "a", to: "b" } });
    expect(redactFinancials(changes, true)).toBe(changes);
  });

  it("counts days until a date", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(daysUntil(new Date("2026-10-17T12:00:00Z"), now)).toBe(10);
    expect(daysUntil(new Date("2026-10-01T12:00:00Z"), now)).toBe(-6);
    expect(daysUntil(null, now)).toBeNull();
  });
});
