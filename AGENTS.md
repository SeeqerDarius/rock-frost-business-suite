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
