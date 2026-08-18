import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "@/lib/tenant";

const mockSchoolSummary = vi.fn();
const mockFleetSummary = vi.fn();
const mockCrmSummary = vi.fn();
const mockInventoryOverview = vi.fn();
const mockAccountingSummary = vi.fn();
const mockPosSummary = vi.fn();

vi.mock("@/modules/school/service", () => ({ getSchoolSummary: mockSchoolSummary }));
vi.mock("@/modules/fleet/service", () => ({ getFleetSummary: mockFleetSummary }));
vi.mock("@/modules/crm/service", () => ({ getCrmSummary: mockCrmSummary }));
vi.mock("@/modules/inventory-procurement/overview", () => ({ getInventoryProcurementOverview: mockInventoryOverview }));
vi.mock("@/modules/accounting/service", () => ({ getAccountingSummary: mockAccountingSummary }));
vi.mock("@/modules/pos/service", () => ({ getPosSummary: mockPosSummary }));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const mockSupportService = {
  isPlatformOnline: vi.fn(),
  isAiReplyRateLimited: vi.fn(),
  listSupportMessages: vi.fn(),
  sendAiMessage: vi.fn(),
};
vi.mock("@/lib/support/service", () => mockSupportService);

function makeTenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: "user-1",
    organizationId: "org-1",
    organization: { id: "org-1", name: "Acme Academy", tenantCode: "ACME", industry: "Education", status: "ACTIVE" },
    role: "Staff",
    roleId: "role-1",
    roleIsSystem: false,
    roleOrganizationId: "org-1",
    permissions: [],
    branch: null,
    enabledModuleKeys: [],
    accessibleModuleKeys: [],
    memberships: [],
    ...overrides,
  } as TenantContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("Support assistant — tool dispatcher permission gating", () => {
  it("denies every tool and never queries the underlying module when the tenant lacks the matching permission and module", async () => {
    const { callSupportAssistantTool } = await import("@/lib/ai/support-assistant");
    const tenant = makeTenant({ permissions: [], enabledModuleKeys: [] });

    const tools: Array<[string, ReturnType<typeof vi.fn>]> = [
      ["get_school_overview", mockSchoolSummary],
      ["get_fleet_overview", mockFleetSummary],
      ["get_crm_overview", mockCrmSummary],
      ["get_inventory_overview", mockInventoryOverview],
      ["get_accounting_overview", mockAccountingSummary],
      ["get_pos_overview", mockPosSummary],
    ];

    for (const [toolName, summaryMock] of tools) {
      const result = await callSupportAssistantTool(toolName, tenant);
      expect(result.ok, toolName).toBe(false);
      expect(summaryMock, toolName).not.toHaveBeenCalled();
    }
  });

  it("calls the real School summary function, scoped to the tenant's own organization, once permission and module are both present", async () => {
    const { callSupportAssistantTool } = await import("@/lib/ai/support-assistant");
    mockSchoolSummary.mockResolvedValue({ activeStudents: 12 });
    const tenant = makeTenant({ permissions: ["school.view"], enabledModuleKeys: ["school"] });

    const result = await callSupportAssistantTool("get_school_overview", tenant);

    expect(result).toEqual({ ok: true, data: { activeStudents: 12 } });
    expect(mockSchoolSummary).toHaveBeenCalledWith("org-1");
  });

  it("calls getInventoryProcurementOverview with the full tenant (not just the org id), since that function does its own finer-grained permission redaction", async () => {
    const { callSupportAssistantTool } = await import("@/lib/ai/support-assistant");
    mockInventoryOverview.mockResolvedValue({ hasProcurement: false });
    const tenant = makeTenant({ permissions: ["inventory.view"], enabledModuleKeys: ["inventory"] });

    await callSupportAssistantTool("get_inventory_overview", tenant);

    expect(mockInventoryOverview).toHaveBeenCalledWith(tenant);
  });

  it("returns a structured error for an unknown tool name rather than throwing", async () => {
    const { callSupportAssistantTool } = await import("@/lib/ai/support-assistant");
    const result = await callSupportAssistantTool("get_something_fictional", makeTenant());
    expect(result.ok).toBe(false);
  });
});

describe("Support assistant — getAssistantReply", () => {
  it("degrades gracefully with no thrown error when ANTHROPIC_API_KEY is unset", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { getAssistantReply } = await import("@/lib/ai/support-assistant");

    const result = await getAssistantReply(makeTenant(), [{ speaker: "tenant", content: "How many students do we have?" }]);

    expect(result).toEqual({ ok: false, error: "AI assistant is not configured." });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("runs the tool-use loop: executes an authorized tool, feeds the result back, and returns the model's final text", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockSchoolSummary.mockResolvedValue({ activeStudents: 482 });
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tool-1", name: "get_school_overview", input: {} }],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "You have 482 active students." }],
      });

    const { getAssistantReply } = await import("@/lib/ai/support-assistant");
    const tenant = makeTenant({ permissions: ["school.view"], enabledModuleKeys: ["school"] });

    const result = await getAssistantReply(tenant, [{ speaker: "tenant", content: "How many students do we have?" }]);

    expect(result).toEqual({ ok: true, content: "You have 482 active students." });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockSchoolSummary).toHaveBeenCalledWith("org-1");

    // The tool result fed back to the model must reflect a real, successful call.
    const secondCallArgs = mockCreate.mock.calls[1][0];
    const toolResultMessage = secondCallArgs.messages.at(-1);
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0].is_error).toBe(false);
    expect(JSON.parse(toolResultMessage.content[0].content)).toEqual({ activeStudents: 482 });
  });

  it("feeds an authorization error back to the model as an error tool_result, never the raw data, when the tenant lacks the permission", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tool-1", name: "get_accounting_overview", input: {} }],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "I don't have access to show you that." }],
      });

    const { getAssistantReply } = await import("@/lib/ai/support-assistant");
    // No accounting.view permission and accounting module not enabled.
    const tenant = makeTenant({ permissions: [], enabledModuleKeys: [] });

    await getAssistantReply(tenant, [{ speaker: "tenant", content: "What's our cash balance?" }]);

    expect(mockAccountingSummary).not.toHaveBeenCalled();
    const secondCallArgs = mockCreate.mock.calls[1][0];
    const toolResultMessage = secondCallArgs.messages.at(-1);
    expect(toolResultMessage.content[0].is_error).toBe(true);
    expect(JSON.parse(toolResultMessage.content[0].content).error).toBeTruthy();
  });
});

describe("Support assistant — triggerAiReplyIfEligible", () => {
  it("does nothing when the sending user lacks the ai.assistant.use permission", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: [] }));
    expect(mockSupportService.listSupportMessages).not.toHaveBeenCalled();
    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
  });

  it("does nothing when a platform operator is currently online — the human handles it", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    mockSupportService.isPlatformOnline.mockResolvedValue(true);
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));
    expect(mockSupportService.listSupportMessages).not.toHaveBeenCalled();
  });

  it("does nothing once the organization's hourly AI-reply cap is reached", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    mockSupportService.isPlatformOnline.mockResolvedValue(false);
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(true);
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));
    expect(mockSupportService.listSupportMessages).not.toHaveBeenCalled();
  });

  it("sends the assistant's reply through support.sendAiMessage when every condition is met", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockSupportService.isPlatformOnline.mockResolvedValue(false);
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      messages: [{ senderRole: "TENANT", content: "How many students do we have?" }],
    });
    mockCreate.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "I can check that for you." }] });

    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));

    expect(mockSupportService.sendAiMessage).toHaveBeenCalledWith("org-1", "I can check that for you.");
  });

  it("does not call sendAiMessage when the assistant fails to produce a reply", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    mockSupportService.isPlatformOnline.mockResolvedValue(false);
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      messages: [{ senderRole: "TENANT", content: "Hello?" }],
    });

    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));

    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
  });
});
