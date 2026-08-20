import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentTenant = vi.fn();
vi.mock("@/lib/tenant", () => ({ getCurrentTenant: mockGetCurrentTenant }));

const mockCanAccessModule = vi.fn();
const mockHasPermission = vi.fn();
vi.mock("@/lib/auth/permissions", () => ({
  canAccessModule: mockCanAccessModule,
  hasPermission: mockHasPermission,
}));

const mockGetSummary = vi.fn();
vi.mock("@/lib/reports/registry", () => ({
  REPORT_REGISTRY: {
    accounting: { moduleKey: "accounting", title: "Accounting report", permission: "accounting.reports.view", getSummary: mockGetSummary },
  },
}));

const { GET } = await import("@/app/api/reports/[moduleKey]/route");

const TENANT = { organizationId: "org-1", organization: { name: "Acme Ltd" } };

function paramsFor(moduleKey: string) {
  return { params: Promise.resolve({ moduleKey }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentTenant.mockResolvedValue(TENANT);
  mockCanAccessModule.mockReturnValue(true);
  mockHasPermission.mockReturnValue(true);
  mockGetSummary.mockResolvedValue({ totalRevenue: 100 });
});

describe("report export route", () => {
  it("returns 401 when there is no current tenant", async () => {
    mockGetCurrentTenant.mockResolvedValue(null);
    const response = await GET(new Request("https://example.com/api/reports/accounting?format=pdf"), paramsFor("accounting"));
    expect(response.status).toBe(401);
  });

  it("returns 404 for a module key with no registered report", async () => {
    const response = await GET(new Request("https://example.com/api/reports/unknown?format=pdf"), paramsFor("unknown"));
    expect(response.status).toBe(404);
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it("returns 403 when the module is not enabled for the tenant", async () => {
    mockCanAccessModule.mockReturnValue(false);
    const response = await GET(new Request("https://example.com/api/reports/accounting?format=pdf"), paramsFor("accounting"));
    expect(response.status).toBe(403);
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it("returns 403 when the tenant lacks the report's permission, even with module access", async () => {
    mockHasPermission.mockReturnValue(false);
    const response = await GET(new Request("https://example.com/api/reports/accounting?format=pdf"), paramsFor("accounting"));
    expect(response.status).toBe(403);
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it("returns 400 for a format other than pdf or xlsx", async () => {
    const response = await GET(new Request("https://example.com/api/reports/accounting?format=csv"), paramsFor("accounting"));
    expect(response.status).toBe(400);
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it("streams a PDF with an attachment filename when every check passes", async () => {
    const response = await GET(new Request("https://example.com/api/reports/accounting?format=pdf"), paramsFor("accounting"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("attachment; filename=\"accounting-report-");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("streams an XLSX with the spreadsheet content type when every check passes", async () => {
    const response = await GET(new Request("https://example.com/api/reports/accounting?format=xlsx"), paramsFor("accounting"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe("PK");
  });
});
