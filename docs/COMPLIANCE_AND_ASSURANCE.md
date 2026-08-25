# Compliance and assurance register

Last reviewed: 2026-08-15

## Website cookie consent

Optional Vercel Web Analytics and Speed Insights are consent-gated. They do
not mount in the browser until a visitor selects Accept optional analytics.
Essential only leaves them disabled. The first-party `rf_cookie_consent`
preference uses `SameSite=Lax`, uses `Secure` on HTTPS, applies site-wide, and
expires after 180 days. Visitors can reopen the choice from Cookie settings in
the public footer. Essential authentication, security, and organization-state
cookies remain independent because the application cannot operate safely
without them. The public `/cookie-policy` route documents these categories.

As of 2026-08-25, "applies site-wide" is enforced at the cookie level, not
just in copy: `serializeCookieConsent()` (`src/lib/cookie-consent.ts`) sets
`Domain=.rockfrostgroup.com` whenever the current hostname is one of the three
production surfaces (`www`/`app`/`admin.rockfrostgroup.com`), so a choice made
on one surface is honored on the others instead of re-prompting per host. This
is the opposite of the auth-cookie policy (see `docs/ARCHITECTURE.md`), which
is deliberately host-only to prevent an owner/tenant session collision; the
domain attribute is applied only in the client-side `serializeCookieConsent()`
call path, never to auth cookies. Local development and preview deployments
fall outside `rockfrostgroup.com` and correctly get a host-only cookie. The
root layout also reads the existing consent cookie server-side and passes it
into `ConsentManagedAnalytics` as `initialConsent`, so the server-rendered
markup already reflects a returning visitor's choice instead of always
assuming "no decision yet" and showing the banner for one frame before
client-side hydration corrects it.

This control supports privacy compliance but is not a legal certification.
Rock Frost must keep the published category list aligned with any future
analytics, advertising, embedded-media, or profiling technology before that
technology is enabled.

## Purpose and claims policy

This register distinguishes implemented product controls from external legal, regulatory, certification, and assurance outcomes. Rock Frost must not advertise the platform as DPC-approved, GRA-approved, SOC 2 certified, ISO/IEC 27001 certified, or independently penetration-tested unless a current document from the relevant authority, certification body, or assessor supports that exact statement.

Legal compliance depends on product controls, customer configuration, operating procedures, contracts, hosting arrangements, and actual day-to-day processing. This document is an engineering and operations readiness record, not legal advice or a certificate.

## Current control status

| Area | Status | Current evidence | Remaining external or operational work |
| --- | --- | --- | --- |
| Ghana Data Protection Act, 2012 (Act 843) readiness | Partial | Tenant isolation, access control, audit events, scoped exports, protected backup restore, account security controls | Complete a data inventory and retention schedule, controller/processor contracts, DPC registration assessment, data-subject request operating procedure, breach workflow, and legal review |
| GRA financial audit readiness | Partial | Financial mutations and privileged events use tenant-scoped application audit records | Obtain tax and legal requirements for each regulated customer; implement and independently verify a tamper-evident or write-once financial ledger before describing logs as immutable or GRA-accepted |
| SOC 2 Type II | Not certified | Security controls and operational documentation provide preparation evidence | Define control owners, operate controls for the audit period, select an independent CPA firm, remediate findings, and obtain the report |
| ISO/IEC 27001 | Not certified | Security, testing, release, and incident documentation provide initial ISMS inputs | Establish ISMS scope, risk register, Statement of Applicability, internal audit, management review, and accredited certification audit |
| MFA | Implemented | TOTP setup and verification for tenant and platform identities; protected restore re-verifies password and TOTP when enabled | Decide whether selected roles or customers require mandatory MFA by policy |
| RBAC | Implemented | Server-side tenant permissions, module-aware roles, active-module checks, and safe role assignment | Continue permission-pair coverage for every Server Action |
| SSO | Planned | No production corporate identity-provider integration is claimed | Select Google Workspace and Microsoft Entra ID requirements, enforce verified-domain account linking, and test tenant-safe provisioning and deprovisioning |
| Encryption in transit | Provider-dependent and configured | HTTPS deployment plus HSTS and security headers | Preserve TLS configuration and verify it after infrastructure changes |
| Encryption at rest | Provider-dependent | Managed database and hosting controls must be evidenced from provider settings and contracts | Record provider, region, encryption details, key ownership, and backup encryption evidence |
| Tenant isolation | Implemented with continuing assurance | Organization-scoped service queries and disposable-Postgres tenant-isolation tests | Keep integration tests required in CI and add coverage with every new model or export |
| Granular audit logs | Implemented, not immutable | Tenant-scoped audit view/export and logged privileged events | Add cryptographic chaining or write-once external retention after disposable-database migration tests and independent design review |
| Automated backups | Partial | Tenant-controlled JSON backups, Excel exports, active-module scoping, protected merge restore | Confirm provider snapshot frequency, retention, separate failure domain, restore tests, RPO, and RTO |
| Data export restrictions | Implemented for organization backup/export | Separate `org.data.export` permission, tenant and active-module scoping, no-store responses, logged successful downloads | Audit future module-specific exports before release |
| Third-party penetration test | Not completed or not evidenced | Automated tests, dependency audit, secret scanning, validation, and security headers are internal controls | Commission an independent scoped test, remediate findings, retest, and prepare a customer-safe executive summary |

## Sensitive export control

Organization backup and Excel downloads require `org.data.export`, independently of `org.settings.manage`. This permits least-privilege assignment and prevents ordinary settings access from silently granting bulk export rights. Organization Owners and Super Admins receive the permission through the all-permissions seed. Other roles do not receive it unless intentionally assigned.

Every successful JSON or Excel download creates a tenant-scoped `tenant_data.exported` audit event containing the format, requested scope, and included active modules. Export responses use `Cache-Control: private, no-store`. Audit CSV values beginning with spreadsheet formula characters are neutralized before download.

Backup restore remains separately controlled by `org.settings.manage`, current-password confirmation, tenant identity checks, active-module validation, upload size limits, and TOTP confirmation when enabled.

## Required enterprise evidence pack

Before answering an enterprise RFQ, the operator should maintain current copies of:

1. Data-processing and privacy notices reviewed for Act 843.
2. Subprocessor list, hosting region, database region, and backup region.
3. Provider encryption and availability evidence.
4. Incident response contacts, severity matrix, notification workflow, and exercise record.
5. Backup schedule, retention, RPO, RTO, and dated restore-test evidence.
6. Vulnerability remediation policy and dated dependency/secret scan evidence.
7. Independent penetration-test executive summary when commissioned.
8. SOC 2 or ISO certificate and scope only after independently issued.

## Next technical gates

1. Tamper-evident audit integrity: design an organization-scoped hash chain or external write-once sink, add migration and verification tooling, then run the real-Postgres integration and concurrency suite before deployment.
2. Privacy lifecycle: implement data-subject request cases, approval, export, correction, deletion or legal-hold decisions, and full audit events after the legal retention model is approved.
3. Enterprise SSO: add provider configuration, verified-domain linking, tenant-safe account lifecycle, break-glass access, and sign-in audit events.
4. Backup assurance: automate restore drills and record recovery evidence against approved RPO and RTO.
