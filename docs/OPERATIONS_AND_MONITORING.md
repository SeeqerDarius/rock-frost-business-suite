# Operations and Monitoring

The authenticated daily `/api/cron/expire-trials` operations job also applies approved HR terminations whose effective date has arrived. It reports `effectiveTerminations` in its structured completion log and response. `CRON_SECRET` authorization remains mandatory.

## Production health

`GET /api/health` is the external uptime probe. It performs a minimal
`SELECT 1` against PostgreSQL and returns:

- HTTP `200` with `{ ok: true, database: "reachable" }` when the application
  and database are healthy.
- HTTP `503` with `{ ok: false, database: "unreachable" }` when the database
  cannot be reached.

The response is always `Cache-Control: no-store` and never exposes connection
strings, SQL errors, hostnames, or credentials. Configure an uptime monitor to
request `https://www.rockfrostgroup.com/api/health` at least every five
minutes and alert on two consecutive failures.

## Trial-expiry cron

Vercel invokes `GET /api/cron/expire-trials` daily at 01:15 UTC from
`vercel.json`. Vercel sends `Authorization: Bearer <CRON_SECRET>`; the route
rejects missing or incorrect credentials with HTTP `401`.

The sweep:

1. Finds customer organizations still in `TRIAL` 14 days after creation.
2. Excludes protected platform-anchor organizations and any organization with
   a current active subscription.
3. Claims each tenant with an idempotent guarded update.
4. Changes the organization to `SUSPENDED`, disables enabled modules, notifies
   active members, and writes `organization.trial_expired` to the audit log in
   the same transaction.

Overlapping invocations are safe: only the first guarded update can claim a
tenant. Never invoke the production route without the configured bearer
secret. Rotate `CRON_SECRET` if it is disclosed.

## Logs and error handling

API health and cron routes emit JSON logs with severity, route, request ID,
correlation ID, duration, and bounded outcome counts. `src/instrumentation.ts`
logs server-instance initialization and uncaught Next.js request errors
without request bodies, authorization headers, or secrets.

Use Vercel Runtime Logs to alert on:

- `Trial-expiry cron failed`
- `Health check failed`
- `Unhandled Next.js request error`
- HTTP `5xx` responses or sustained latency increases

Every cron success should report `candidates` and `expired`. A missing daily
success is itself an operational incident.

## Performance monitoring

The root layout makes Vercel Web Analytics and Speed Insights available, but
the browser mounts them only after the visitor accepts optional analytics in
the cookie preferences interface. Choosing Essential only leaves both tools
disabled. The saved first-party preference expires after 180 days and can be
changed with Cookie settings in the public footer. Track Core Web Vitals for
consenting traffic by route, with these operational targets:

- LCP below 2.5 seconds at the 75th percentile.
- INP below 200 milliseconds at the 75th percentile.
- CLS below 0.1 at the 75th percentile.
- TTFB below 800 milliseconds where the route is not intentionally waiting on
  a cold database connection.

Review the slowest tenant and public routes weekly. Optimize observed
bottlenecks before adding speculative caching to tenant or financial data.

## Accessibility baseline

Every public, authentication, and application surface has a keyboard-visible
“Skip to main content” link and a focusable `main` landmark. Global styles
respect `prefers-reduced-motion`. Next.js route announcements depend on unique
page titles and headings; new pages must provide both.

ESLint accessibility rules remain mandatory, but automated checks do not
replace keyboard, screen-reader, zoom, contrast, and responsive testing.

## Dependency resilience

Production dependencies are audited after installation. The July 2026
hardening pass upgraded Next.js to 16.2.12 and NextAuth to 4.24.15, and pins
patched PostCSS/Sharp transitive versions through `package.json` overrides.
Run `npm audit --omit=dev` on every dependency change and document any accepted
advisory with scope and compensating controls.
