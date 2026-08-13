# Support Messaging

**Status: implemented and enforced.** In-app support chat between tenant organizations and Rock Frost platform operators. Migration `20260813040000_add_support_messaging`.

## What this is

A persistent, one-conversation-per-organization chat, not a multi-thread ticketing system. Any signed-in member of a tenant organization can open `/app/support` and message Rock Frost; any platform operator can open `/app/platform/support` to see every tenant's conversation and reply. There is no email delivery anywhere in this feature — see "No email" below.

This is deliberately **not a business module**: no `platform/modules/registry.ts` entry, no module-prefix permission gate, and no inclusion in the tenant backup/export system (`BACKUP_MODULES`). It follows the same precedent as `Notification`/`AuditLog` — cross-cutting organization-scope + platform-scope infrastructure available unconditionally to every tenant regardless of which business modules they've enabled. Excluding it from tenant backups is deliberate, not an oversight: message history can contain a platform operator's name, and that identity must never leak into a tenant's own data export.

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

`SupportChat` (`src/components/support/support-chat.tsx`) polls for new messages and presence every 4 seconds via a Server Action, gated the same way as the heartbeat (visible tabs only). New messages are deduplicated against a client-side `Set` of known IDs and appended past a `lastTimestampRef` cursor, so a message the sender just sent (appended optimistically on send) is never duplicated when the next poll also returns it.

## No email — by explicit design

This feature must never send anything to the owner's email or any tenant's email. There is no `sendEmail`/Resend call anywhere in `src/lib/support/service.ts`, `src/app/app/(overview)/support/actions.ts`, or `src/app/app/platform/support/actions.ts`. `test/support-messaging.test.ts`'s "access-guard source coverage" block enforces this as a regression guard, asserting none of those files match `/sendEmail|resend|@\/lib\/email/i`. The owner learns about new messages only by having the platform Support inbox open (or its live unread-count nav badge), the same as a tenant.

## Access model

- **Tenant side** (`/app/support`, `src/app/app/(overview)/support/`): gated only by `requireCurrentTenant()` — any active member of any organization can reach it, deliberately *not* gated by a module-prefix permission the way business-module pages are, since every tenant should always be able to reach support regardless of which modules or roles they have.
- **Platform side** (`/app/platform/support`, `src/app/app/platform/support/`): gated by `requirePlatformOperator()` at the page level (defense-in-depth, matching `platform/dashboard/page.tsx`) and by a local `requirePlatformOperatorTenant()` helper (`isPlatformOperator(tenant)`) inside every Server Action in `actions.ts` — never trust the page-level guard alone, since Server Actions are directly callable.
- `listPlatformConversations()`/`getPlatformUnreadCount()` both exclude platform-anchor organizations (`getPlatformAnchorOrganizationIds()`) — Rock Frost's own internal organizations never appear as a "tenant" needing support.

## HCI / accessibility notes

- Presence is never color-only: an `AvatarBadge` dot on the header avatar is paired with an explicit "Online"/"Offline" text label.
- New messages are announced to screen readers via an `aria-live="polite"` sr-only region.
- Enter sends; Shift+Enter inserts a newline. The message textarea has a visually-hidden `<label>`.
- Auto-scroll-to-bottom only fires if the viewer was already near the bottom (within 120px) — scrolling up to re-read history is never interrupted by an incoming message.
- The send button and textarea disable during send (`useTransition`), and a failed send surfaces an inline retry message rather than silently dropping the draft.
- Polling and heartbeats both respect `document.visibilityState`, avoiding wasted requests (and, on a laptop, wasted battery) on backgrounded tabs.

## Known gaps

- No push notifications outside the app (by design — see "No email" above); a tenant or operator only learns of a new message by having the page open or by the sidebar's live unread-count badge, which itself only updates on server-rendered navigation, not in real time.
- No file/image attachments — text only.
- No multi-thread history; resolving a conversation (`setConversationStatus`) only changes its status badge, it does not archive or hide prior messages, and a new message from either side reopens it to `OPEN` automatically.
- The real-Postgres integration tests (`test/integration/tenant-isolation/support-messaging.test.ts`, `test/integration/concurrency/support-messaging.test.ts`) are written but unexecuted in this environment — see `docs/TESTING_STRATEGY.md`. The mocked-DB unit suite (`test/support-messaging.test.ts`, 13 tests) does run in CI/local validation and passes.
