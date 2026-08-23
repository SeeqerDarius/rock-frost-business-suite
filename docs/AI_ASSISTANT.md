# AI Support Assistant

**Status: implemented.** AI is available in two controlled surfaces: the existing tenant-to-platform Support chat and Accounting Insights at `/app/accounting/insights`. This document covers both security boundaries. See `docs/SUPPORT_MESSAGING.md` for the support conversation's presence-based human handoff.

## Accounting Insights assistant

The Accounting assistant is not a general database agent. The server resolves the signed-in tenant, checks `accounting.reports.view` and `ai.assistant.use`, computes a bounded 30-day, 90-day, or 12-month aggregate, and sends only that aggregate plus the user's question to Groq. The browser cannot supply an organization id. A 30-question per-user hourly limit is enforced through tenant-scoped audit events, and the question text is not stored in the audit trail. If the provider is unavailable or unconfigured, deterministic answers use the same aggregate instead of failing the page.

## History

An earlier implementation of this repository had a working `/assistant` page backed by `lib/ai/client.ts` and `app/api/ai/route.ts`, built deliberately as minimal, decoupled-from-live-data scaffolding. That implementation was archived during a full rebuild, but two pieces of its intent survived: the `ai.assistant.use` permission (already granted to every seeded role, same tier as `dashboard.view`) and an API key slot in `.env.example`. This feature rebuilds the capability — merged into Support chat instead of a separate page, and, per explicit product decision this time, able to answer using an organization's own live business data rather than staying fully decoupled from it.

**Provider note:** this originally ran on Anthropic's Claude API. It was switched to Groq (`groq-sdk`) so the feature runs on Groq's permanently free tier (14,400 requests/day, no credit card) instead of a paid, usage-billed API — a deliberate cost decision, not a capability gap. Groq's free tier also carries no "we may train on your data" clause, unlike some other free LLM tiers. The tool-calling architecture below is provider-agnostic in shape; only `src/lib/ai/client.ts` and the request/response plumbing in `getAssistantReply()` are Groq-specific (OpenAI-compatible `chat.completions.create` shape: `tools` as `{type:"function", function:{name, description, parameters}}`, tool results as `{role:"tool", tool_call_id, content}` messages, rather than Anthropic's `tool_use`/`tool_result` content blocks).

## Architecture

- **`src/lib/ai/client.ts`** — `getGroqClient()` returns `null` when `GROQ_API_KEY` is unset, mirroring `src/lib/email.ts`'s exact graceful-degradation pattern (module-level cache, read once per process). `SUPPORT_ASSISTANT_MODEL` is a hardcoded constant — no separate env var, matching this repo's "one var, no extra config" convention for optional integrations. **Groq rotates and deprecates free-tier models on its own schedule** (the original choice, `llama-3.3-70b-versatile`, was retired 2026-08-16, three days after this feature shipped, breaking every AI reply with a silent-to-the-tenant `model_not_found` error caught only via Vercel's runtime error log). Currently set to `openai/gpt-oss-120b`. Check https://console.groq.com/docs/models for the current production model list before changing this, and watch https://console.groq.com/docs/deprecations if replies stop working with no code changes on this side.
- **`src/lib/ai/support-assistant.ts`** — the assistant itself:
  - `buildSystemPrompt(tenant)` gives the model the organization's name/industry and explicit rules: never state a number without a tool call backing it, never claim to be human, hand off to the real Rock Frost team for billing/account/complaint questions or on request.
  - Six tools, one per wired module, **each with zero input parameters** — the organization is always the server-resolved caller's own `tenant.organizationId`, never something the model can pass in. This is the single security invariant the whole feature rests on: there is no parameter shape through which a crafted question could name a different organization.
  - `callSupportAssistantTool(name, tenant)` dispatches each tool, checking `hasPermission(tenant, PERMISSIONS.<MODULE>_VIEW)` before calling the real, already-tenant-scoped module service function — the exact same permission each module's own dashboard page checks. A denied permission returns a structured `{ok: false, error}` tool result (not a thrown error), so the model can tell the user it can't show that rather than the turn failing.
  - `getAssistantReply(tenant, transcript)` runs the standard tool-use loop (call model → execute any requested tools → feed results back → repeat, capped at 4 iterations) and returns final text. Never throws — degrades to `{ok: false, error}` on any failure, same contract as the email helper.
  - `triggerAiReplyIfEligible(tenant)` is the entry point called from the Support actions layer — see `docs/SUPPORT_MESSAGING.md` for the eligibility conditions (permission, configured, no human online, under the rate cap).

## The six wired tools today

| Tool | Permission | Underlying function |
|---|---|---|
| `get_school_overview` | `SCHOOL_VIEW` | `getSchoolSummary(organizationId)` — `src/modules/school/service.ts` |
| `get_fleet_overview` | `FLEET_VIEW` | `getFleetSummary(organizationId)` — `src/modules/fleet/service.ts` |
| `get_crm_overview` | `CRM_VIEW` | `getCrmSummary(organizationId)` — `src/modules/crm/service.ts` |
| `get_inventory_overview` | `INVENTORY_VIEW` | `getInventoryProcurementOverview(tenant)` — `src/modules/inventory-procurement/overview.ts` (takes the full tenant since it does its own finer-grained redaction of low-stock detail behind `INVENTORY_REPORTS_VIEW`, reused as-is) |
| `get_accounting_overview` | `ACCOUNTING_VIEW` | `getAccountingSummary(organizationId)` — `src/modules/accounting/service.ts` |
| `get_pos_overview` | `POS_VIEW` | `getPosSummary(organizationId)` — `src/modules/pos/service.ts` |

These six were chosen because each already had a clean, reusable, tenant-scoped summary function — no new query logic was written for them, the tools just call what each module's own dashboard already calls.

## Adding another module's tool

1. Confirm (or add) a `get<Module>Summary(organizationId)`-style exported function in that module's `service.ts`. If none exists, extract one from the dashboard page's inline queries rather than duplicating the logic.
2. Add a tool definition to `TOOLS` in `support-assistant.ts` — no input parameters, a description mirroring the real stat tiles the module's dashboard shows.
3. Add a case to `callSupportAssistantTool()` gating on that module's own `_VIEW` permission (matching what the module's dashboard page itself checks) before calling the summary function.
4. Add a test to `test/ai-support-assistant.test.ts` asserting the new tool denies access without the permission and calls the right function with it.

## Explicitly out of scope (for now)

- Only 6 of 15 modules have a wired tool. The remaining 9 (HR, Payroll, Procurement, Projects, Analytics, Hotel, Pharmacy, Hospital, Installment) follow the identical pattern above whenever there's a reason to add them — this is a deliberate, documented gap, not an oversight.
- No streaming responses — short business Q&A doesn't need it.
- No per-organization opt-out toggle for AI responses.
- No admin UI for tuning the rate-limit cap (hardcoded in `src/lib/support/service.ts`, changeable in code).

## Testing

Mocked-DB unit tests only (`test/ai-support-assistant.test.ts`, plus AI-specific additions to `test/support-messaging.test.ts`) — the Groq SDK itself is mocked, matching this repo's two-tier testing strategy (`docs/TESTING_STRATEGY.md`). There is no live-model integration test; verifying an actual AI reply requires a real `GROQ_API_KEY` in the tester's own environment (free at https://console.groq.com/keys).
