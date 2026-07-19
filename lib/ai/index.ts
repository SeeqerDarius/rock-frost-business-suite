import "server-only";

import { getAnthropicClient } from "./client";
import type { TenantContext } from "@/lib/tenant";

const MODEL = "claude-opus-4-8";

/**
 * Builds a system prompt scoped to the current tenant and the modules their
 * organization actually has. Deliberately kept general-purpose rather than
 * wired into live Fleet data — this is Phase 9 scaffolding (see
 * docs/DEVELOPMENT_ROADMAP.md), meant to stay decoupled from core business
 * logic so it doesn't become a second, parallel path into business data.
 */
function buildSystemPrompt(tenant: TenantContext): string {
  const branchLine = tenant.branch ? `The user's branch is ${tenant.branch.name}.` : "";

  return `You are the Rock Frost Business Suite assistant, embedded in a multi-tenant business management SaaS platform.

You are helping a user from the organization "${tenant.organization.name}" (tenant code: ${tenant.organization.tenantCode}). ${branchLine}
The user's role is ${tenant.role ?? "Member"}.

The platform currently has two active business modules:
1. Fleet & Asset Management (vehicles, drivers, owners, insurance/roadworthy compliance, maintenance, work-and-pay contracts, payments).
2. Hire Purchase (installment/layaway sales): customers, staff-assigned accounts, daily installment payments and receipts, products and procurement, staff salaries and inventory allocation, overpayment/closure credits and refunds, and financial reports.

Answer questions about fleet operations, Hire Purchase installment operations, best practices, and how to use the platform. You do not have live access to this organization's actual vehicle, driver, customer, or financial records — if asked for specific figures, explain that you can't see their live data yet and suggest where in the dashboard they'd find it, rather than guessing or inventing numbers.

Keep responses concise and practical.`;
}

export interface AssistantResult {
  ok: boolean;
  reply?: string;
  error?: string;
}

export async function getAssistantResponse(tenant: TenantContext, question: string): Promise<AssistantResult> {
  const client = getAnthropicClient();

  if (!client) {
    return { ok: false, error: "The AI assistant is not configured yet. Set ANTHROPIC_API_KEY to enable it." };
  }

  if (!question.trim()) {
    return { ok: false, error: "Please enter a question." };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: buildSystemPrompt(tenant),
    messages: [{ role: "user", content: question }],
  });

  if (response.stop_reason === "refusal") {
    return { ok: false, error: "The assistant declined to answer that question." };
  }

  const textBlock = response.content.find((block): block is Extract<typeof block, { type: "text" }> => block.type === "text");

  if (!textBlock) {
    return { ok: false, error: "The assistant didn't return a text response." };
  }

  return { ok: true, reply: textBlock.text };
}
