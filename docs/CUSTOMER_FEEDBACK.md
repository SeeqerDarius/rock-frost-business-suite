# Customer feedback and workspace moments

## Feedback lifecycle

Every authenticated tenant user can open `/app/feedback` from the persistent “Share feedback” action. Suggestions, problems and general feedback are private. A testimonial becomes publication-eligible only when the submitter explicitly permits publication; name, organization and logo each have separate consent flags.

New submissions start at `SUBMITTED` and never publish automatically. Platform operators review them at `/app/platform/feedback`, which supports organization, category, rating and status filters. Operators may move a record through `UNDER_REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED` or `HIDDEN`, add an internal note, make presentation-only wording corrections, choose consent-bounded attribution and control ordering. Every decision creates a `CustomerFeedbackEvent` audit row.

The submitter may withdraw publication consent from `/app/feedback`. Withdrawal sets `WITHDRAWN`, clears all public display flags and permanently removes the entry from the public query. The original record and events remain for audit. Every submitter read and withdrawal is constrained by both `organizationId` and `userId`. A 30-minute per-user submission interval limits accidental duplicates and spam.

The public homepage reads only `PUBLISHED` `TESTIMONIAL` records whose publication consent remains true. These join the existing operator-approved customer showcase in the established accessible carousel near the final call to action. The live homepage does not use fictional demonstration testimonials. One or two entries render as stable cards; larger sets retain swipe, keyboard and button navigation without autoplay.

## Greetings

The authenticated organization dashboard uses the organization timezone to render “Good morning,” “Good afternoon,” or “Good evening,” optionally followed by a safe first name. Boundaries are 05:00, 12:00 and 17:00. Missing or invalid timezones fall back to `Africa/Accra`; unsafe or missing names produce a neutral greeting. The greeting is calculated during server rendering, so it cannot hydrate to a different value on the client.

## Motivation messages

`WorkspaceMoments` maintains a small local list of original, unattributed business messages. A message can appear at most once every four hours per user, avoids repeating the most recent message, appears after the workspace settles, dismisses immediately or after ten seconds, and uses browser storage rather than notifications or server writes. It is excluded from account, billing, support, feedback and platform routes. Motion is applied only through `motion-safe` utilities, so reduced-motion preferences are respected.

## Validation

Unit coverage verifies consent and publication filters, tenant/user constraints, text normalization, greeting boundaries, timezone fallback, safe-name fallback, motivation frequency, dismissal and reduced-motion wiring. The guarded real-Postgres integration test proves cross-tenant isolation, consented publication, private problem handling and withdrawal against the disposable Neon test database.
