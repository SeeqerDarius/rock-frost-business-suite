# School in-app communications

Direct conversations between school staff and guardians, and school
announcements, inside the app. **No SMS, WhatsApp, email, or push
notification is sent** by any of this; people see new items when they open
the app (unread badges on My Portal, the conversation lists, and the
announcement lists). Implemented 2026-10-08.

## Data model

Migration `20261014090000_school_communications` (additive only):

| Table | Purpose |
|---|---|
| `SchoolConversation` | One conversation between the school and one guardian about one student: subject, status (`OPEN`/`CLOSED`), which side started it, `lastMessageAt`. |
| `SchoolMessage` | Text message (1 to 4,000 characters), sender user, sender side (`STAFF`/`GUARDIAN`), sender display name captured at send time, and `clientRequestId`. |
| `SchoolConversationReadState` | Per reader: `lastReadAt` for a conversation. Unread = messages from other people after it. |
| `SchoolAnnouncement` | Title, body, audience (`STAFF`, `ALL_GUARDIANS`, `CLASS_GUARDIANS` with a class, `EVERYONE`), publisher, withdrawn state, and `clientRequestId`. |
| `SchoolAnnouncementRead` | Per reader: when an announcement was read. |

Also: `Organization.schoolGuardianMessagingGranted` (+ `GrantedAt`, `GrantedById`), default `false`.

Protections:

- Every table carries `organizationId`. Conversations reference the student and guardian, messages and read states reference the conversation, and announcements reference the class through **composite `(organizationId, id)` foreign keys** (new unique keys on `SchoolStudent`, `SchoolGuardian`, and `SchoolClass`), so the database itself rejects a row that points at another organization's record.
- CHECK constraints: subject and title 2 to 120 characters, message and announcement 1 to 4,000 characters (after trimming), and `classId` present exactly when the audience is `CLASS_GUARDIANS`.
- `@@unique([conversationId, clientRequestId])` on messages and `@@unique([organizationId, clientRequestId])` on announcements: every form render carries a fresh request id, so a double click or retried request records one message or announcement. The submit button also disables itself while sending.
- Indexes for the list views (`organizationId, guardianId, lastMessageAt`; `organizationId, lastMessageAt`; `organizationId, conversationId, createdAt`; `organizationId, publishedAt`) and the per-user read lookups.

Messages are text only. There are no attachments. Fee, payment, attendance,
and library details are not copied into conversations; the conversation
header shows the student's current class from the existing enrollment
records, and guardians keep using My Portal for fees and results.

## Authorization

All checks run on the server in `src/modules/school/communications-service.ts` on every read and write. Pages and actions only decide which screen to show.

- **Staff messaging** needs the new `school.messages.manage` permission (granted to School Administrator, Academic Head, Teacher, Admissions Officer, and Bursar; Organization Owner and Admin hold every permission). A staff member assigned to classes (`SchoolClassTeacher`) reaches only students **actively enrolled** in those classes, the same rule `resolveTeacherClassScope()` applies to attendance and results. Staff with no class assignment reach every student. An out-of-scope or missing conversation returns "not found" either way, so ids cannot be probed.
- **Starting a conversation (staff)**: the student must be in scope and the guardian must be linked to that student (`SchoolStudentGuardian`) and have a portal account, so the message can actually be read.
- **Guardians** are resolved from their own login (`resolveSchoolPortalScope()`), never from form input. A guardian sees a conversation only while it is theirs **and** the student is still linked to them; removing the link removes access. A guardian can start a conversation only about their own linked child. Student portal accounts have no messaging and no announcements.
- **Closed conversations** accept no new messages from either side until staff reopen them.
- **Announcements**: publishing and withdrawing need the new `school.announcements.publish` permission (School Administrator, Academic Head, and organization administrators). Every School staff member (`school.view`) sees announcements in the app; staff-audience ones count as unread for them. Guardians see `ALL_GUARDIANS` and `EVERYONE` announcements, plus `CLASS_GUARDIANS` announcements for classes where one of their linked students is actively enrolled. Withdrawn announcements disappear for everyone except publishers, who still see them marked Withdrawn.
- Audit events (ids only, never message text): `school.conversation.started`, `.closed`, `.reopened`, `school.announcement.published`, `.withdrawn`.

## Paid guardian messaging

The existing billing model can represent and enforce this, because it already sells operator-granted, per-organization add-ons. Guardian messaging is one of those add-ons: `schoolGuardianMessaging` in `src/platform/organizations/feature-addons.ts`, scoped to School and toggled by a platform operator from the organization's Configuration pane (`toggleSchoolGuardianMessaging()` in `src/app/app/platform/actions.ts`, audited as `school_guardian_messaging.platform_granted` or `_revoked`). It is **off by default**, and no price is set in code; pricing stays with the operator.

- Direct conversations need **both** the Parent and Student portal grant and the Guardian messaging grant (`isGuardianMessagingAvailable()`), because guardians read and reply from My Portal. Without both, the staff Messages page and the portal Messages page show a "not enabled" state and every service call refuses with `unavailable`. Navigation hides the links too, but that is only a convenience.
- Announcements are part of School itself. Guardians read them in My Portal, so they need the portal grant.
- Revoking a grant hides the screens without deleting any conversation history.

## Screens

| Route | Who | What |
|---|---|---|
| `/app/school/messages` | Staff with messaging permission | Conversation list (open, closed, all) with unread badges and last-message preview; "New conversation" (student and guardian, subject, first message). |
| `/app/school/messages/[conversationId]` | Same | Message history (most recent 200, oldest first), reply box, close or reopen. Opening marks it read. |
| `/app/school/announcements` | All School staff | Announcements with audience and New badges; publishers also see read counts, publish, and withdraw. Opening marks staff announcements read. |
| `/app/school/portal/messages` | Guardians | Their conversations with unread badges; "Message the school" about one of their children. |
| `/app/school/portal/messages/[conversationId]` | Guardians | Message history and reply box. |
| `/app/school/portal/announcements` | Guardians | Announcements for them. Opening marks them read. |

My Portal shows Announcements and Messages entry points with unread counts. Screens use labelled form controls, list semantics, `role="status"` and `role="alert"` result banners, `time` elements, and layouts that work at phone width. Error text from the server travels in a short-lived httpOnly cookie (`school-comms-flash`), never in the URL.

## Tests

- `test/school-communications.test.ts`: permission gate before any data access, both add-ons required, input validation before writes, repeated form submission, publish permission and class check.
- `test/school-portal-access.test.ts`: navigation by role and grant (Parent, Student, staff with and without messaging).
- `test/platform-sms-and-portal-grants.test.ts`: the operator-only Guardian messaging toggle.
- `test/platform-organization-configuration.test.ts`: the add-on nests under School.
- `test/integration/tenant-isolation/school-communications.test.ts` (real PostgreSQL, the disposable CI database): add-on gating; class-teacher scope; guardian link and portal-account requirements; invalid input; idempotent sends; unread and read state for a guardian, a class teacher, and an unrestricted administrator; out-of-scope teacher, other guardian, student account, and other organization all refused; the database rejecting a cross-organization row; closed conversations; access removed with the student link; guardian-started conversations; announcement permission, audience CHECK, class targeting, read state, deduplication, withdrawal, and portal revocation.

## Known limits

- In-app only: nobody is alerted outside the app when a message arrives.
- Text only, no attachments.
- Staff see conversations by student scope, not by named participant: every staff member with messaging permission and the student in scope can read and reply.
- Lists show the 100 most recent conversations or announcements, and a conversation shows its 200 most recent messages.
