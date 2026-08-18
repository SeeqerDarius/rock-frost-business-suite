# Support Messaging

**Status: implemented and enforced.** In-app support chat between tenant organizations and Rock Frost platform operators. Migration `20260813040000_add_support_messaging`.

## What this is

A persistent, one-conversation-per-organization chat, not a multi-thread ticketing system. Any signed-in member of a tenant organization gets a floating chat bubble (bottom-right, everywhere in the tenant workspace) to message Rock Frost; any platform operator gets a floating bubble linking to a two-pane inbox (`/app/platform/support`) listing every tenant's conversation. There is no email delivery anywhere in this feature — see "No email" below.

This is deliberately **not a business module**: no `platform/modules/registry.ts` entry, no module-prefix permission gate, and no inclusion in the tenant backup/export system (`BACKUP_MODULES`). It follows the same precedent as `Notification`/`AuditLog` — cross-cutting organization-scope + platform-scope infrastructure available unconditionally to every tenant regardless of which business modules they've enabled. Excluding it from tenant backups is deliberate, not an oversight: message history can contain a platform operator's name, and that identity must never leak into a tenant's own data export.

## Entry point: a floating chat bubble, not a sidebar link

Support is intentionally not a sidebar navigation destination. `src/app/app/layout.tsx` — the one layout every authenticated route (every module, organization scope, and platform scope) already renders under — mounts one of two floating widgets in the bottom-right corner, chosen by identity:

- **Tenant** (`src/components/support/floating-support-widget.tsx`): a self-contained bubble that expands into a full chat panel in place, without navigating away from whatever page the user is on. The panel lazy-loads its message history on first open (`SupportChat`'s own poll effect fires immediately on mount) rather than fetching it on every page navigation across the workspace — only a cheap unread-count query runs on every request. While the panel is closed, a lightweight 12-second poll keeps the bubble's unread badge current; opening the panel stops that poll and hands off to `SupportChat`'s own 4-second message poll. The panel also links to the dedicated `/app/support` page (kept, not removed) for anyone who prefers — or needs — a full-page surface: a larger hit target, more history visible at once, easier for screen magnifier or motor-impaired users than a small floating box.
- **Platform** (`src/components/support/floating-support-link.tsx`): a bubble that links to the full `/app/platform/support` two-pane inbox rather than opening an inline panel. An operator triaging conversations across many tenant organizations needs the list-plus-detail layout that page provides; a small floating widget can't do that justice, so the bubble here is purely a low-friction entry point, refreshing its own unread badge every 15 seconds.

Both dedicated pages (`/app/support`, `/app/platform/support`) still exist and are fully functional — only their sidebar nav entries were removed (`workspace-navigation.tsx`, `platform-navigation.tsx`).

### Open/close animation and responsiveness

The panel and both bubble triggers use `tw-animate-css` utilities (the same animation system already powering this design system's dropdown/menu components — see `src/components/ui/dropdown-menu.tsx`), not a bespoke transition system:

- **Opening**: the panel mounts with `animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4` (`origin-bottom-right`, so it visually grows out of the bubble it came from) over 200ms.
- **Closing**: `FloatingSupportWidget` doesn't unmount the panel the instant it's dismissed. Closing sets a `pointer-events-none` exit-animation state (`animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-2`, 150ms) and only unmounts ~160ms later, once the animation has actually had time to play — the standard "delay unmount past the animation duration" pattern for conditionally-rendered exit animations in React.
- **Trigger icon**: the bubble morphs between a message icon and a close (X) icon via a small crossfade + rotate transition (`transition-all duration-200`), rather than an abrupt swap.
- **Entrance**: both bubbles play a brief scale/fade-in (`zoom-in-75`, 300ms) on first mount, plus a `hover:scale-105`/`active:scale-95` micro-interaction, consistent with this design system's existing button press feedback (`active:translate-y-px` in `button.tsx`).
- All of the above collapses to near-instant automatically under `prefers-reduced-motion` via this codebase's existing blanket rule in `globals.css` (`animation-duration`/`transition-duration: 0.01ms !important`) — no per-component reduced-motion handling was needed.
- **Responsiveness**: below the `sm` breakpoint the panel is `inset-4` (near-full-screen, a comfortable single-hand chat surface on a phone) rather than a small corner card; at `sm` and above it reverts to a fixed `w-96`/`h-[32rem]` card anchored to the bottom-right corner. `SupportChat` gained an optional `className` prop (merged via `cn`/`tailwind-merge`) specifically so the floating widget can override its default fixed height with this responsive sizing without changing the component used by the two full, non-floating pages.

## Data model

Three Prisma models (see `prisma/schema.prisma`, bottom section):

- **`SupportConversation`** — one row per organization (`organizationId @unique`). Tracks `status` (`OPEN`/`RESOLVED`), `lastMessageAt`, and independent `tenantLastReadAt`/`platformLastReadAt` read-cursors (each side's unread count is derived from the other side's messages newer than its own cursor).
- **`SupportMessage`** — belongs to a conversation and denormalizes `senderName` at send time, so history still reads correctly if a display name later changes or the account is deleted (`senderId` goes `null` via `onDelete: SetNull`, the same pattern as `AuditLog.userId`).
- **`UserPresence`** — one row per user (`userId @id`), holding only `lastSeenAt`. Updated by a heartbeat, described below.

## Presence ("online indicator")

There is no WebSocket/real-time infrastructure in this app, so presence is heartbeat-based, not push-based:

- While a support chat surface (`/app/support` or `/app/platform/support`) is open and the tab is visible, the client calls a heartbeat Server Action every 20 seconds, upserting `UserPresence.lastSeenAt` for the signed-in user.
- A user counts as online if `lastSeenAt` is within `ONLINE_WINDOW_MS` (45 seconds) — see `isPlatformOnline()`/`isTenantOnline()` in `src/lib/support/service.ts`.
- `isPlatformOnline()` checks presence across every active Super Admin (`role: { name: "Super Admin", isSystem: true, organizationId: null }`) — the tenant sees "online" the moment any platform operator has an open, visible support tab.
- `isTenantOnline(organizationId)` checks presence across that organization's own active members only.
- Heartbeats (and the message poll described below) stop firing the moment `document.visibilityState !== "visible"`, via a `visibilitychange` listener — a backgrounded tab does not keep either side falsely "online" or spend network/battery for no reason.

This intentionally answers "is a support surface currently open," not "is this user logged in anywhere" — closing the tab (or the tab going to the background) lets presence expire naturally within 45 seconds, with no explicit sign-off action needed.

## Message delivery (polling, not push)

`SupportChat` (`src/components/support/support-chat.tsx`) polls for new messages, presence, and read receipts every 4 seconds via a Server Action, gated the same way as the heartbeat (visible tabs only) — and fires once immediately on mount, not just on the interval, so a panel that lazy-loads without server-rendered history (the floating widget) populates right away instead of sitting empty for up to 4 seconds. New messages are deduplicated against a client-side `Set` of known IDs and appended past a `lastTimestampRef` cursor, so a message the sender just sent (appended optimistically on send) is never duplicated when the next poll also returns it.

## Read receipts

Each side of a `SupportConversation` already tracks its own `tenantLastReadAt`/`platformLastReadAt` cursor (used for unread counts). `otherPartyReadAt(conversation, viewerRole)` in `src/lib/support/service.ts` reads the *other* side's cursor from the viewer's perspective — the value a viewer's own sent messages must be compared against to know whether they've been seen. Both `sendTenantSupportMessage`/`sendPlatformSupportMessage` and `pollTenantSupportMessages`/`pollPlatformSupportMessages` return this value alongside messages; `SupportChat` compares each of the viewer's own messages' `createdAt` against it (ISO 8601 UTC strings compare correctly lexicographically) and renders a `Check`/`CheckCheck` icon with an accessible "Sent"/"Read" label — never a bare icon with no text equivalent, matching this codebase's existing "never color/icon alone" convention for the online indicator.

## Optional quick-reply templates

`src/lib/support/templates.ts` exports `TENANT_SUPPORT_TEMPLATES` and `PLATFORM_SUPPORT_TEMPLATES` — short, plain-data label/content pairs (billing question, technical issue, etc. for tenants; acknowledge, need more info, resolved, following up for operators). `SupportChat` renders them behind an optional "Quick replies" dropdown next to the composer only when a `templates` prop is passed. Selecting one **only populates the draft textarea** (`handleSelectTemplate`) — it never sends automatically, so the user can still edit before submitting. Enforced by a source-inspection test (`test/support-messaging.test.ts`) asserting `handleSelectTemplate`'s function body never calls `handleSubmit`/`onSend`/`startSendTransition`.

## AI-assisted first response

A third participant, `SupportSenderRole.AI`, can reply inside this same conversation — it is not a separate feature or a separate chat surface. See `docs/AI_ASSISTANT.md` for the tool-calling architecture; this section covers how it's wired into support specifically.

**When it fires.** After a tenant sends a message (`sendTenantSupportMessage` in `src/app/app/(overview)/support/actions.ts`), an AI reply is scheduled via `next/server`'s `after()` — so the tenant's own send stays exactly as fast as before, and the reply (if any) lands a few seconds later via the same 4-second poll every other message uses. It only actually generates a reply when **all** of these hold, checked in `triggerAiReplyIfEligible()` (`src/lib/ai/support-assistant.ts`):

- The sender holds `ai.assistant.use` (granted to every seeded role by default, same tier as `dashboard.view`).
- `ANTHROPIC_API_KEY` is configured. Unset is the default out of the box — the assistant then never replies, and the conversation behaves exactly as it did before this feature existed.
- **No platform operator is currently online** (`support.isPlatformOnline()`) — the same presence check the tenant's own "Online"/"Offline" indicator already uses. This is the deliberate "hand off to a human" behavior: when a human is present, the human answers; when none is, the AI does, and a human can still jump into the same thread at any time afterward.
- The organization is under its hourly AI-reply cap (`isAiReplyRateLimited()`, 40/hour) — a cheap guard against runaway API spend, not a customer-facing limit anyone is expected to hit in normal use.

Any unmet condition, or any failure inside the model call itself, is silent — no error ever reaches the tenant. The message simply sits unanswered until a human replies, exactly like today.

**What it can see.** The assistant answers general questions from its own training plus a small set of read-only tools that return the organization's own live numbers (School, Fleet, CRM, Inventory, Accounting, POS today — see `docs/AI_ASSISTANT.md` for the full list and how to add more). Every tool call is scoped to the tenant's own `organizationId` server-side and gated by the same permission the corresponding module's dashboard page itself requires — the model never supplies an organization ID or any other tenant-identifying parameter, so there is no request shape through which a crafted question could reach another tenant's data.

**What it never does.** Never emails anyone (covered by the same regression guard as the rest of this feature, see below), never claims to be human, and is explicitly instructed to hand off to the real Rock Frost team for billing, account changes, complaints, or whenever it's asked for a person.

**Data model.** `SupportMessage.senderRole` gained a third Postgres enum value, `AI` (migration `20260818210000_add_support_ai_sender_role`, purely additive). An AI-authored message has `senderId: null` and a fixed `senderName: "Rock Frost AI Assistant"`, and — unlike a tenant or platform message — bumps **neither** read cursor when sent (`sendAiMessage()` in `src/lib/support/service.ts`): it isn't a read acknowledgment from either side, just new content. The tenant's own unread badge (`getTenantUnreadCount`) counts AI messages the same as platform ones, so a tenant still sees they got an answer; the platform's own unread badge (`getPlatformUnreadCount`) stays tenant-message-only by deliberate choice, since an AI-answered message doesn't need an operator's immediate attention the way a fresh tenant message does.

**UI.** `SupportChat` (`src/components/support/support-chat.tsx`) renders an AI message with a distinct avatar (a Sparkles icon instead of initials), a small "AI" badge next to the sender name, and a bubble color distinct from both the viewer's own messages and a genuine human reply. A one-line disclosure ("Some replies here are automated. The Rock Frost team can always help too.") appears once a conversation contains at least one AI message. Both surfaces that use `SupportChat` — the floating widget and the dedicated `/app/support` page — get this automatically, since it's the same shared component and the same underlying data.

## No email — by explicit design

This feature must never send anything to the owner's email or any tenant's email. There is no `sendEmail`/Resend call anywhere in `src/lib/support/service.ts`, `src/app/app/(overview)/support/actions.ts`, or `src/app/app/platform/support/actions.ts`. `test/support-messaging.test.ts`'s "access-guard source coverage" block enforces this as a regression guard, asserting none of those files match `/sendEmail|resend|@\/lib\/email/i`. The owner learns about new messages only by having the platform Support inbox open (or its live unread-count nav badge), the same as a tenant.

## Access model

- **Tenant side** (`/app/support`, `src/app/app/(overview)/support/`): gated only by `requireCurrentTenant()` — any active member of any organization can reach it, deliberately *not* gated by a module-prefix permission the way business-module pages are, since every tenant should always be able to reach support regardless of which modules or roles they have.
- **Platform side** (`/app/platform/support`, `src/app/app/platform/support/`): gated by `requirePlatformOperator()` at the page level (defense-in-depth, matching `platform/dashboard/page.tsx`) and by a local `requirePlatformOperatorTenant()` helper (`isPlatformOperator(tenant)`) inside every Server Action in `actions.ts` — never trust the page-level guard alone, since Server Actions are directly callable.
- `listPlatformConversations()`/`getPlatformUnreadCount()` both exclude platform-anchor organizations (`getPlatformAnchorOrganizationIds()`) — Rock Frost's own internal organizations never appear as a "tenant" needing support.

## HCI / accessibility notes

- Presence is never color-only: an `AvatarBadge` dot on the header avatar is paired with an explicit "Online"/"Offline" text label. Read receipts follow the same rule — a `Check`/`CheckCheck` icon always carries a "Sent"/"Read" text equivalent (visually a `title` tooltip, an `sr-only` span for assistive tech).
- New messages are announced to screen readers via an `aria-live="polite"` sr-only region.
- Enter sends; Shift+Enter inserts a newline. The message textarea has a visually-hidden `<label>`.
- Auto-scroll-to-bottom only fires if the viewer was already near the bottom (within 120px) — scrolling up to re-read history is never interrupted by an incoming message.
- The send button and textarea disable during send (`useTransition`), and a failed send surfaces an inline retry message rather than silently dropping the draft.
- Polling and heartbeats both respect `document.visibilityState`, avoiding wasted requests (and, on a laptop, wasted battery) on backgrounded tabs.
- The floating bubble is keyboard-operable: a real `<button>` with `aria-expanded`/`aria-label` reflecting open/unread state, `Escape` closes the panel and returns focus to the bubble, and the panel is marked `role="dialog"` with an accessible label. It is deliberately *not* the only way to reach support — the dedicated full pages remain linked and functional for anyone who finds a small floating widget harder to use.
- Templates are additive, not a constraint: choosing one only fills the composer, so a user who prefers to type their own message freely is never forced through a template.

## Known gaps

- No push notifications outside the app (by design — see "No email" above); a tenant or operator only learns of a new message by having a support surface open or via the floating bubble's periodically-refreshed unread badge, which is polling-based, not instant.
- No file/image attachments — text only.
- No multi-thread history; resolving a conversation (`setConversationStatus`) only changes its status badge, it does not archive or hide prior messages, and a new message from either side reopens it to `OPEN` automatically.
- Read receipts are conversation-level granularity (one shared "other side's last-read cursor"), not literal per-message read events — accurate for a two-party conversation (which this always is: one tenant side, one platform side), but would need a different design if this ever became a multi-party thread.
- The real-Postgres integration tests (`test/integration/tenant-isolation/support-messaging.test.ts`, `test/integration/concurrency/support-messaging.test.ts`) are written but unexecuted in this environment — see `docs/TESTING_STRATEGY.md`. The mocked-DB unit suite (`test/support-messaging.test.ts`, 16 tests) does run in CI/local validation and passes.
