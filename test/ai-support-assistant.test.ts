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
vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    chat = { completions: { create: mockCreate } };
  },
}));

const mockSupportService = {
  isPlatformOnlineForConversation: vi.fn(),
  isAiReplyRateLimited: vi.fn(),
  listSupportMessages: vi.fn(),
  sendAiMessage: vi.fn(),
  sendSystemMessage: vi.fn(),
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
  // getGroqClient() (src/lib/ai/client.ts) memoizes its result in a
  // module-level variable computed from GROQ_API_KEY the first time it's
  // called — resetting the module registry before every test (not just the
  // ones that explicitly delete the key) guarantees each test's import sees
  // a fresh, unmemoized client reflecting whatever this beforeEach just set
  // process.env.GROQ_API_KEY to, rather than silently inheriting whatever
  // an earlier test happened to cache.
  vi.resetModules();
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = "test-key";
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
  it("degrades gracefully with no thrown error when GROQ_API_KEY is unset", async () => {
    vi.resetModules();
    delete process.env.GROQ_API_KEY;
    const { getAssistantReply } = await import("@/lib/ai/support-assistant");

    const result = await getAssistantReply(makeTenant(), [{ speaker: "tenant", content: "How many students do we have?" }]);

    expect(result).toEqual({ ok: false, reason: "not_configured", error: "AI assistant is not configured." });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("runs the tool-use loop: executes an authorized tool, feeds the result back, and returns the model's final text", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockSchoolSummary.mockResolvedValue({ activeStudents: 482 });
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "tool-1", type: "function", function: { name: "get_school_overview", arguments: "{}" } }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "You have 482 active students.", tool_calls: undefined } }],
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
    expect(toolResultMessage.role).toBe("tool");
    expect(toolResultMessage.tool_call_id).toBe("tool-1");
    expect(JSON.parse(toolResultMessage.content)).toEqual({ activeStudents: 482 });
  });

  it("feeds an authorization error back to the model as a JSON error payload, never the raw data, when the tenant lacks the permission", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "tool-1", type: "function", function: { name: "get_accounting_overview", arguments: "{}" } }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "I don't have access to show you that.", tool_calls: undefined } }],
      });

    const { getAssistantReply } = await import("@/lib/ai/support-assistant");
    // No accounting.view permission and accounting module not enabled.
    const tenant = makeTenant({ permissions: [], enabledModuleKeys: [] });

    await getAssistantReply(tenant, [{ speaker: "tenant", content: "What's our cash balance?" }]);

    expect(mockAccountingSummary).not.toHaveBeenCalled();
    const secondCallArgs = mockCreate.mock.calls[1][0];
    const toolResultMessage = secondCallArgs.messages.at(-1);
    expect(toolResultMessage.role).toBe("tool");
    expect(JSON.parse(toolResultMessage.content).error).toBeTruthy();
  });

  it("returns reason 'empty_response' when the model returns no usable content and no tool calls", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "   ", tool_calls: undefined } }] });

    const { getAssistantReply } = await import("@/lib/ai/support-assistant");
    const result = await getAssistantReply(makeTenant(), [{ speaker: "tenant", content: "Hi" }]);

    expect(result).toEqual({ ok: false, reason: "empty_response", error: "AI assistant returned an empty response." });
  });

  it("returns reason 'provider_error' when the underlying API call throws", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockRejectedValueOnce(new Error("network down"));

    const { getAssistantReply } = await import("@/lib/ai/support-assistant");
    const result = await getAssistantReply(makeTenant(), [{ speaker: "tenant", content: "Hi" }]);

    expect(result).toEqual({ ok: false, reason: "provider_error", error: "AI assistant failed to respond." });
  });
});

describe("Support assistant — triggerAiReplyIfEligible", () => {
  it("does nothing when the sending user lacks the ai.assistant.use permission — no_permission is silent, retrying can't help", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: [] }));
    expect(mockSupportService.listSupportMessages).not.toHaveBeenCalled();
    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
    expect(mockSupportService.sendSystemMessage).not.toHaveBeenCalled();
  });

  it("does nothing when GROQ_API_KEY is unset — not_configured is silent, retrying can't help", async () => {
    vi.resetModules();
    delete process.env.GROQ_API_KEY;
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));
    expect(mockSupportService.listSupportMessages).not.toHaveBeenCalled();
    expect(mockSupportService.sendSystemMessage).not.toHaveBeenCalled();
  });

  it("does nothing when listSupportMessages reports no conversation yet for this sender", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    mockSupportService.listSupportMessages.mockResolvedValue({ conversation: null, messages: [] });

    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));

    expect(mockSupportService.isAiReplyRateLimited).not.toHaveBeenCalled();
    expect(mockSupportService.isPlatformOnlineForConversation).not.toHaveBeenCalled();
    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
  });

  it("once the organization's hourly AI-reply cap is reached, logs and sends a visible SYSTEM notice — the tenant is waiting and nothing resolves this on its own", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    mockSupportService.listSupportMessages.mockResolvedValue({
      conversation: { id: "conv-1" },
      messages: [{ senderRole: "TENANT", content: "Hi" }],
    });
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(true);

    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));

    expect(mockSupportService.isPlatformOnlineForConversation).not.toHaveBeenCalled();
    expect(mockSupportService.sendSystemMessage).toHaveBeenCalledWith("conv-1", expect.any(String));
    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
  });

  it("does nothing (silently) when a Super Admin's heartbeat is currently pointed at this specific conversation — human_online is the correct, expected handoff", async () => {
    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      conversation: { id: "conv-1" },
      messages: [{ senderRole: "TENANT", content: "Hi" }],
    });
    mockSupportService.isPlatformOnlineForConversation.mockResolvedValue(true);

    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));

    expect(mockSupportService.isPlatformOnlineForConversation).toHaveBeenCalledWith("conv-1");
    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
    expect(mockSupportService.sendSystemMessage).not.toHaveBeenCalled();
  });

  it("logs and sends a visible SYSTEM notice when the assistant itself fails (e.g. provider_error), never a fake reply", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.isPlatformOnlineForConversation.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      conversation: { id: "conv-1" },
      messages: [{ senderRole: "TENANT", content: "Hi" }],
    });
    mockCreate.mockRejectedValueOnce(new Error("network down"));

    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"] }));

    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
    expect(mockSupportService.sendSystemMessage).toHaveBeenCalledWith("conv-1", expect.any(String));
  });

  it("an operator viewing organization A's conversation never suppresses organization B's AI reply — the confirmed regression this phase fixes", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      conversation: { id: "conv-org-b" },
      messages: [{ senderRole: "TENANT", content: "How many students do we have?" }],
    });
    // The operator's presence is scoped to org A's conversation specifically, not org B's.
    mockSupportService.isPlatformOnlineForConversation.mockImplementation(async (conversationId: string) => conversationId === "conv-org-a");
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "Answer for org B.", tool_calls: undefined } }],
    });

    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    await triggerAiReplyIfEligible(makeTenant({ permissions: ["ai.assistant.use"], organizationId: "org-b" }));

    expect(mockSupportService.isPlatformOnlineForConversation).toHaveBeenCalledWith("conv-org-b");
    expect(mockSupportService.sendAiMessage).toHaveBeenCalledWith("conv-org-b", "Answer for org B.");
  });

  it("sends the assistant's reply through support.sendAiMessage, targeting the sender's own conversation, when every condition is met", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      conversation: { id: "conv-1" },
      messages: [{ senderRole: "TENANT", content: "How many students do we have?" }],
    });
    mockSupportService.isPlatformOnlineForConversation.mockResolvedValue(false);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "I can check that for you.", tool_calls: undefined } }],
    });

    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    const tenant = makeTenant({ permissions: ["ai.assistant.use"] });
    await triggerAiReplyIfEligible(tenant);

    expect(mockSupportService.listSupportMessages).toHaveBeenCalledWith(tenant.organizationId, tenant.userId);
    expect(mockSupportService.sendAiMessage).toHaveBeenCalledWith("conv-1", "I can check that for you.");
  });

  it("a retry (a second call to the same eligibility pipeline) succeeds after a first failed attempt — the 'Try again' button's underlying contract", async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    mockSupportService.isAiReplyRateLimited.mockResolvedValue(false);
    mockSupportService.isPlatformOnlineForConversation.mockResolvedValue(false);
    mockSupportService.listSupportMessages.mockResolvedValue({
      conversation: { id: "conv-1" },
      messages: [{ senderRole: "TENANT", content: "How many students do we have?" }],
    });

    const { triggerAiReplyIfEligible } = await import("@/lib/ai/support-assistant");
    const tenant = makeTenant({ permissions: ["ai.assistant.use"] });

    mockCreate.mockRejectedValueOnce(new Error("network down"));
    await triggerAiReplyIfEligible(tenant);
    expect(mockSupportService.sendAiMessage).not.toHaveBeenCalled();
    expect(mockSupportService.sendSystemMessage).toHaveBeenCalledTimes(1);

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "You have 482 active students.", tool_calls: undefined } }],
    });
    await triggerAiReplyIfEligible(tenant);
    expect(mockSupportService.sendAiMessage).toHaveBeenCalledWith("conv-1", "You have 482 active students.");
  });
});
