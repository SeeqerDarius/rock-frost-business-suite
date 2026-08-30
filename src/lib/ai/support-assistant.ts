import "server-only";

import type Groq from "groq-sdk";
import type { TenantContext } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getGroqClient, SUPPORT_ASSISTANT_MODEL } from "@/lib/ai/client";
import * as support from "@/lib/support/service";
import { getSchoolSummary } from "@/modules/school/service";
import { getFleetSummary } from "@/modules/fleet/service";
import { getCrmSummary } from "@/modules/crm/service";
import { getAccountingSummary } from "@/modules/accounting/service";
import { getPosSummary } from "@/modules/pos/service";
import { getInventoryProcurementOverview } from "@/modules/inventory-procurement/overview";

/**
 * The AI assistant that answers inside the existing tenant<->platform
 * support conversation (see docs/SUPPORT_MESSAGING.md). It only fires when
 * no human platform operator is currently online (support.isPlatformOnline())
 * — when one is, the human handles it, matching this feature's "hand off to
 * a real person" design. Every tool below is independently gated by the same
 * permission the corresponding module's own dashboard page checks, and takes
 * zero tenant-identifying input from the model — the organization is always
 * the server-resolved caller's own, never something the model can pass in.
 * This is the single security invariant that makes live-data tool use safe:
 * there is no parameter shape through which a crafted question could ever
 * name a different organization.
 */

export interface AssistantTranscriptMessage {
  speaker: "tenant" | "platform" | "ai";
  content: string;
}

interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_school_overview",
      description: "Get this organization's live School module numbers: active students, active classes, attendance breakdown, fee collections and outstanding balances, overdue library loans, and active transport routes. Only useful if the organization actually runs a school.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fleet_overview",
      description: "Get this organization's live Fleet module numbers: vehicle count and status breakdown, active drivers, pending maintenance requests, active work-and-pay contracts, and this month's fleet payments.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crm_overview",
      description: "Get this organization's live CRM numbers: pipeline value, win rate, deals won this month, contacts, leads, open leads, and activity logged this month.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_overview",
      description: "Get this organization's live Inventory (and Procurement, if enabled) numbers: item and warehouse counts, stock value, low-stock items, and, when Procurement is enabled, vendor and purchase-order activity.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_accounting_overview",
      description: "Get this organization's live Accounting numbers: cash balance, accounts receivable, revenue, expenses, net income, and outstanding or overdue invoices.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pos_overview",
      description: "Get this organization's live Point of Sale numbers: registers, open sessions, today's sales, all-time sales, and refunds.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

/** Exported for testing the permission-gating dispatch directly, without needing a mocked Groq client. */
export async function callSupportAssistantTool(name: string, tenant: TenantContext): Promise<ToolResult> {
  switch (name) {
    case "get_school_overview":
      if (!hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)) return { ok: false, error: "This user does not have access to School data." };
      return { ok: true, data: await getSchoolSummary(tenant.organizationId) };
    case "get_fleet_overview":
      if (!hasPermission(tenant, PERMISSIONS.FLEET_VIEW)) return { ok: false, error: "This user does not have access to Fleet data." };
      return { ok: true, data: await getFleetSummary(tenant.organizationId) };
    case "get_crm_overview":
      if (!hasPermission(tenant, PERMISSIONS.CRM_VIEW)) return { ok: false, error: "This user does not have access to CRM data." };
      return { ok: true, data: await getCrmSummary(tenant.organizationId) };
    case "get_inventory_overview":
      if (!hasPermission(tenant, PERMISSIONS.INVENTORY_VIEW)) return { ok: false, error: "This user does not have access to Inventory data." };
      return { ok: true, data: await getInventoryProcurementOverview(tenant) };
    case "get_accounting_overview":
      if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_VIEW)) return { ok: false, error: "This user does not have access to Accounting data." };
      return { ok: true, data: await getAccountingSummary(tenant.organizationId) };
    case "get_pos_overview":
      if (!hasPermission(tenant, PERMISSIONS.POS_VIEW)) return { ok: false, error: "This user does not have access to POS data." };
      return { ok: true, data: await getPosSummary(tenant.organizationId) };
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

function buildSystemPrompt(tenant: TenantContext): string {
  return `You are the Rock Frost AI Assistant, replying inside the support conversation for ${tenant.organization.name}, an organization using Rock Frost Business Suite${tenant.organization.industry ? ` (${tenant.organization.industry})` : ""}.

This conversation is the same one the organization's staff use to reach the real Rock Frost team - a human from that team can and sometimes does reply here too. Never claim to be human, and never claim a human isn't available.

Rules:
- Never state a number or fact about this organization's own data unless you got it from a tool call in this turn. If nothing here covers what's being asked, say so plainly rather than guessing.
- Tools only cover School, Fleet, CRM, Inventory, Accounting, and POS today. For anything else, or if a tool call comes back saying access isn't available, say so and note the Rock Frost team can help further in this same conversation.
- Keep replies short and conversational - this is a chat, not a report.
- If asked to speak with a person, or the question is about billing, account changes, or a complaint, say the Rock Frost team will follow up here rather than trying to resolve it yourself.`;
}

function transcriptToUserTurn(transcript: AssistantTranscriptMessage[]): string {
  const lines = transcript.map((entry) => {
    const label = entry.speaker === "tenant" ? "Tenant" : entry.speaker === "platform" ? "Rock Frost team" : "AI Assistant";
    return `${label}: ${entry.content}`;
  });
  return `Recent conversation:\n${lines.join("\n")}\n\nRespond to the tenant's latest message above.`;
}

const MAX_TOOL_ITERATIONS = 4;

/** Never throws — degrades to a structured {ok, error} result, same contract as the email helper's send function. */
export async function getAssistantReply(
  tenant: TenantContext,
  transcript: AssistantTranscriptMessage[],
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const client = getGroqClient();
  if (!client) return { ok: false, error: "AI assistant is not configured." };
  if (transcript.length === 0) return { ok: false, error: "Nothing to respond to." };

  try {
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(tenant) },
      { role: "user", content: transcriptToUserTurn(transcript) },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.chat.completions.create({
        model: SUPPORT_ASSISTANT_MODEL,
        max_completion_tokens: 1024,
        tools: TOOLS,
        messages,
      });

      const message = response.choices[0]?.message;
      if (!message) return { ok: false, error: "AI assistant returned an empty response." };

      if (!message.tool_calls || message.tool_calls.length === 0) {
        const content = message.content?.trim();
        return content ? { ok: true, content } : { ok: false, error: "AI assistant returned an empty response." };
      }

      messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });
      for (const toolCall of message.tool_calls) {
        const result = await callSupportAssistantTool(toolCall.function.name, tenant);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
        });
      }
    }

    return { ok: false, error: "AI assistant could not complete a response." };
  } catch (error) {
    console.error("[ai/support-assistant] Failed:", error);
    return { ok: false, error: "AI assistant failed to respond." };
  }
}

/**
 * Called after a tenant support message is sent (see actions.ts's use of
 * next/server's after()). Silently does nothing unless every condition is
 * met - no error ever surfaces to the tenant either way, the message just
 * sits for a human to answer exactly as it always has.
 */
export async function triggerAiReplyIfEligible(tenant: TenantContext): Promise<void> {
  if (!hasPermission(tenant, PERMISSIONS.AI_ASSISTANT_USE)) return;
  if (!getGroqClient()) return;
  if (await support.isAiReplyRateLimited(tenant.organizationId)) return;

  const { conversation, messages } = await support.listSupportMessages(tenant.organizationId, tenant.userId);
  if (!conversation || messages.length === 0) return;

  // Scoped to this one conversation, not a platform-wide check — an
  // operator looking at a different organization's conversation must never
  // suppress this one's AI reply.
  if (await support.isPlatformOnlineForConversation(conversation.id)) return;

  const transcript: AssistantTranscriptMessage[] = messages.slice(-20).map((message) => ({
    speaker: message.senderRole === "TENANT" ? "tenant" : message.senderRole === "PLATFORM" || message.senderRole === "ADMIN" ? "platform" : "ai",
    content: message.content,
  }));

  const reply = await getAssistantReply(tenant, transcript);
  if (!reply.ok) return;
  await support.sendAiMessage(conversation.id, reply.content);
}
