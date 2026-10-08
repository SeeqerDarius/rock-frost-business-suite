# School in-app communications: chat and announcements

School has two communication features, both inside the app: **chat**
(WhatsApp-style direct chats, groups, and broadcast lists between staff and
guardians) and **announcements** (notices to staff and guardians). No SMS,
WhatsApp, or email is sent. New chat messages raise an in-app notification
(the bell) and, for people who opt in on a device, a browser or phone push
notification.

Chat replaced the first release's student-anchored conversations
(2026-10-08) on 2026-10-09. The migration copied those conversations into
chat as groups; the old `SchoolConversation`, `SchoolMessage`, and
`SchoolConversationReadState` tables remain in the database unused, and
`/app/school/messages` and `/app/school/portal/messages` redirect to
`/app/school/chats`.

## Who can chat with whom

Enforced on the server in `src/modules/school/chat-service.ts` for every read and write.

| From | Can start a direct chat with | Can create groups and broadcasts |
|---|---|---|
| Staff with `school.messages.manage` | Any other messaging staff member; guardians whose children are in their scope | Groups: yes. Broadcasts: with `school.announcements.publish` |
| Guardian (Parent portal account) | Messaging staff whose scope includes one of their children | No |

- **Scope**: a staff member assigned to classes (`SchoolClassTeacher`) reaches students actively enrolled in those classes; staff with no class assignment reach every student. Guardians reach staff by the same rule in reverse, so a guardian sees their children's class teachers and the unassigned office and administration staff.
- **Guardians never message guardians directly.** They see other guardians only as fellow members of a group a staff member created. Guardians cannot be group admins.
- **Membership is the access rule.** A chat is visible only to its current members; removed or departed members lose access. A guardian member must still be a guardian of the organization with at least one linked child, and a direct chat stops accepting messages if its two people can no longer reach each other (for example, the child moved class).
- **Paid add-ons**: any chat with a guardian in it needs both the Parent and Student portal and the Guardian messaging add-on (operator-granted, default off, no price in code). Staff-only chats need only School. Revoking an add-on hides guardian chats without deleting them.

## Features

- **Direct chats**: one chat per pair of people (deduplicated by a sorted pair key).
- **Groups**: name, description, optional class, up to 500 members. The creator is an admin. Admins (staff) add and remove members, make other staff admins, rename the group, and can switch on **announcement mode** (only admins send). Anyone can leave; if the last admin leaves, the longest-standing staff member becomes admin. System messages record group events.
- **Broadcast lists**: a staff member with the announcements permission sends one message to all staff, all reachable guardians, the guardians of one class, or chosen people. It lands in each recipient's own direct chat with the sender, so replies stay private. Up to 1,000 recipients; deduplicated by request id.
- **Messages**: text (up to 4,000 characters) with emoji, photos (JPEG, PNG, WEBP) and PDFs up to 4 MB (photos are downscaled in the browser first; the server checks the real file signature), replies with a quoted preview, edit your own text for 15 minutes, delete for everyone (your own; group admins can remove anyone's message in their group, audited), and one emoji reaction per person per message.
- **Read state**: unread counts per chat, single tick (sent) and double tick (seen; blue when everyone has seen it), and "Seen by" names in groups.
- **Organizing**: search the chat list, search within a chat, pin, mute (8 hours, 1 week, always), and archive (an archived chat returns when a new message arrives).
- **Live updates**: an open chat refreshes every 4 seconds and the chat list every 8 seconds while the tab is visible.
- **Safe sending**: each composer render carries a request id with a unique constraint per chat, so a double click or retry records one message; the send button disables while sending; a draft survives live refreshes because the composer only resets after your own send.

## Notifications

- **In-app bell**: each new message creates or updates one unread `Notification` (type `SCHOOL_CHAT_MESSAGE`, `metadata.chatId`) per recipient per chat, so a busy chat does not flood the bell. Opening the chat marks it read. Muted members get no notification. The bell links to the chat.
- **Web push** (`src/lib/web-push.ts`, `public/sw.js`): a person opts in per device from the chat list ("Get notified of new messages"). Subscriptions are stored in `WebPushSubscription`; pushes are sent after the response (`after()`), never block sending, and subscriptions the push service reports gone are deleted. The notification shows the chat or sender name and a short preview, and opens the chat. **Push needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`** (generate the keys once with `npx web-push generate-vapid-keys`); without them the opt-in control is hidden and only the in-app bell works.

## Data model

Migration `20261015090000_school_chat` (additive; it also copies the 2026-10-08 conversations):

| Table | Purpose |
|---|---|
| `SchoolChat` | `DIRECT` (with a unique `directKey`) or `GROUP` (with a name), optional student and class context, announcement mode, `lastMessageAt`. |
| `SchoolChatMember` | Chat member: side (staff or guardian), role (admin or member), display name, `lastReadAt`, `mutedUntil`, `pinnedAt`, `archivedAt`, `leftAt`. |
| `SchoolChatMessage` | `TEXT`, `ATTACHMENT` (FileAsset reference plus name, type, and size snapshot), or `SYSTEM`; reply link, broadcast link, edit and delete stamps, request id. |
| `SchoolChatReaction` | One emoji per person per message. |
| `SchoolChatBroadcast` | One broadcast send: audience, optional class, body, recipient count, request id. |
| `WebPushSubscription` | A user's push endpoint and keys for one device. |

Protections: chats, members, and messages are linked by composite `(organizationId, id)` foreign keys, so the database rejects a member or message pointing at another organization's chat; CHECK constraints cover chat type and name, message kind (text needs text, attachments need a file, system messages have no sender), lengths, attachment size, guardians never being admins, and broadcast class consistency. Attachments are served only to current chat members by `/api/school/chats/attachments/[messageId]` with `nosniff` and a sandboxing content security policy. The Server Action body limit is 5 MB to fit a 4 MB attachment.

## Announcements

Unchanged from the first release: staff with `school.announcements.publish` publish to staff, all guardians, one class's guardians, or everyone, and can withdraw them; per-user read state; guardians read them in My Portal (`/app/school/portal/announcements`), which needs the portal add-on. See `communications-service.ts`.

## Screens

| Route | What |
|---|---|
| `/app/school/chats` | Chat list (search, unread badges, pinned and muted markers, archived link, notification opt-in) beside the open chat; on phones, one pane at a time. |
| `/app/school/chats/[chatId]` | Conversation: day dividers, bubbles, replies, attachments, reactions, ticks, message menu (react, reply, edit, delete), search, and chat menu (group info, pin, mute, archive). |
| `/app/school/chats/[chatId]/info` | Group members and admins, add members, settings, leave. |
| `/app/school/chats/new` | Start a direct chat (people you can reach, searchable by name or child) or create a group. |
| `/app/school/chats/broadcast` | Broadcast list send. |
| `/app/school/chats/archived` | Archived chats. |
| `/app/school/announcements`, `/app/school/portal/announcements` | Announcements for staff and guardians. |

Guardians reach Chats from My Portal (with an unread count) and the School menu.

## Tests

- `test/school-chat.test.ts`: attachment signature, type, and size checks; group and broadcast permissions; input validation; non-members get not found; push off without keys; bell deep link.
- `test/school-communications.test.ts`, `test/school-portal-access.test.ts`, `test/platform-sms-and-portal-grants.test.ts`, `test/platform-organization-configuration.test.ts`, `test/profile-image-upload.test.ts`: actor building, announcement checks, navigation by role and add-on, the operator toggle, and the 5 MB body limit.
- `test/integration/tenant-isolation/school-communications.test.ts` (real PostgreSQL, the disposable CI database): staff chat without add-ons and guardian chat blocked without them; class scope in both directions and no guardian-to-guardian chats; idempotent sends, unread and seen state, one bell entry per chat, muting; replies, the edit window, delete for everyone, reactions; attachments only for members and never across organizations; groups (staff-only creation, scope on members, announcement mode, admins, moderation audit, removal, leaving); broadcast lists delivered privately per recipient with deduplication; cross-organization refusal including the database foreign key; access ending when a guardian loses their last linked child; and the announcement suite.

## Known limits

- Live updates are polling (4 to 8 seconds), not instant; there are no typing indicators.
- Voice notes are not supported. Attachments are stored as database data URIs like other attachments in this app.
- Chat history shows the latest 100 messages of a chat (search finds older ones within that window only).
- Push needs the VAPID keys configured in production, and iPhones only show web push for the app once it is added to the Home Screen.
