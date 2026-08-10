<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared-agent documentation and handoff rules

Multiple agents work in this repository. Documentation is part of every
change, not an optional follow-up.

Before finishing any task that changes code, schema, configuration, behavior,
operations, or tests:

1. Update the relevant authoritative document under `docs/` when behavior,
   architecture, workflows, security posture, deployment, or known gaps
   change.
2. Update `OPERATOR_HANDOFF.md` with a concise dated entry covering the scope,
   important files, migrations or environment changes, validation performed,
   and any remaining risks. Do not rely on the commit message as the handoff.
3. Update `README.md` when setup, scripts, supported modules, deployment
   expectations, or the high-level project status changes.
4. Keep tests and documentation synchronized with new routes and behavior.
   A code change is not complete while its relevant tests or documented
   counts/status are stale.
5. Run validation proportional to the change and record the exact results in
   the handoff. At minimum, run the directly affected tests; for a completed
   implementation task, prefer `npm run lint`, `npm run test`, and
   `npm run build`. Run database integration tests only against the guarded,
   disposable test database described in `docs/TESTING_STRATEGY.md`.
6. Inspect `git status` before editing and before handoff. Preserve other
   agents' work, do not overwrite unrelated changes, and explicitly identify
   pre-existing or concurrent modifications.

Documentation must describe the current truth. Amend the authoritative
current documents instead of treating archived material under
`docs/archive/` as active guidance.

## Production release rule

This repository is operated for production delivery. Unless the user
explicitly limits a task to analysis, a draft, or local-only work, every
completed change must be taken through the full release lifecycle:

1. Make the implementation, tests, documentation, schema, and configuration
   internally consistent and production-ready. Do not knowingly ship partial,
   placeholder, failing, or unverified behavior as complete.
2. Run the proportional local validation gate and all required guarded
   disposable-database integration tests. Database/schema changes must not be
   deployed until their migrations and integration suite pass against the
   disposable test database described in `docs/TESTING_STRATEGY.md`.
3. Commit the intended scope, push it to the configured remote, and use the
   repository's CI/preview workflow as a release gate. Never include unrelated
   concurrent work silently.
4. Deploy or promote the validated artifact to production, then verify health,
   critical changed routes, database migration status, and post-deploy error
   logs. Record the commit, deployment, validation, and remaining risks in
   `OPERATOR_HANDOFF.md`.
5. If a required gate or production verification fails, fix and rerun it. If
   credentials, permissions, an external provider, or another hard blocker
   prevents safe release, stop before production, document the exact blocker,
   and tell the user what authorization or external action is required.

Pushing and deployment are part of the definition of done; passing a local
build alone is not a completed implementation handoff.
