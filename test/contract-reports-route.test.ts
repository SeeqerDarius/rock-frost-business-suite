import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentTenant = vi.fn();
const mockRunContractReport = vi.fn();
const mockLogAuditEvent = vi.fn();

vi.mock("@/lib/tenant", () => ({ getCurrentTenant: mockGetCurrentTenant }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/reports/export", () => ({
  buildReportCsv: (input: { columns: { header: string }[]; rows: Record<string, unknown>[] }) => [input.columns.map((column) => column.header).join(","), ...input.rows.map((row) => Object.values(row).join(","))].join("\n"),
  buildReportExcelWorkbook: async () => Buffer.from("xlsx"),
}));
vi.mock("@/modules/contracts/reports", () => ({
  CONTRACT_REPORTS: { register: { title: "Contract register" } },
  isContractReportKey: (value: string) => value === "register",
  runContractReport: mockRunContractReport,
}));
vi.mock("@/modules/contracts/service", () => {
  class ContractError extends Error {}
  class ContractForbiddenError extends ContractError {}
  return { ContractForbiddenError, actorFromTenant: (tenant: { permissions: string[]; organizationId: string; userId: string }) => ({ organizationId: tenant.organizationId, userId: tenant.userId, roleId: null, permissions: tenant.permissions }) };
});
vi.mock("@/lib/auth/permissions", () => ({
  PERMISSIONS: { CONTRACTS_EXPORT: "contracts.export" },
  canAccessModule: (tenant: { modules: string[] }, key: string) => tenant.modules.includes(key),
}));

const { GET } = await import("@/app/api/contracts/reports/[report]/route");
const params = (report: string) => ({ params: Promise.resolve({ report }) });
const tenant = (permissions: string[], modules = ["contracts"]) => ({ organizationId: "org-a", userId: "user-a", permissions, modules, organization: { name: "Org A" } });

beforeEach(() => {
  vi.clearAllMocks();
  mockRunContractReport.mockResolvedValue({ columns: [{ key: "number", header: "Number" }], rows: [{ number: "CTR/2026/000001" }], summary: [], truncated: false });
});

describe("contract report export route", () => {
  it("requires a session, the module, and the export permission", async () => {
    mockGetCurrentTenant.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://app.test/api/contracts/reports/register"), params("register"))).status).toBe(401);
    mockGetCurrentTenant.mockResolvedValueOnce(tenant(["contracts.export"], []));
    expect((await GET(new Request("https://app.test/api/contracts/reports/register"), params("register"))).status).toBe(403);
    mockGetCurrentTenant.mockResolvedValueOnce(tenant(["contracts.view"]));
    expect((await GET(new Request("https://app.test/api/contracts/reports/register"), params("register"))).status).toBe(403);
    expect(mockRunContractReport).not.toHaveBeenCalled();
  });

  it("rejects unknown reports and returns an audited, uncached CSV", async () => {
    mockGetCurrentTenant.mockResolvedValue(tenant(["contracts.view", "contracts.export"]));
    expect((await GET(new Request("https://app.test/api/contracts/reports/secrets"), params("secrets"))).status).toBe(404);
    const response = await GET(new Request("https://app.test/api/contracts/reports/register?format=csv&from=2026-01-01&to=bad"), params("register"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(await response.text()).toContain("CTR/2026/000001");
    expect(mockRunContractReport).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a" }), "register", { from: new Date("2026-01-01T00:00:00.000Z"), to: null, days: null }, 10_000);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "contracts.report_exported", organizationId: "org-a" }));
  });
});
