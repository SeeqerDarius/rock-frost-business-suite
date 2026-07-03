# Agent Rules

These rules apply to every AI assistant and developer working in Rock Frost Business Suite, including Codex, GitHub Copilot, Claude, ChatGPT, and future contributors.

## Mandatory Reading Before Coding

Before changing any code or documentation, read:

1. `OPERATOR_HANDOFF.md`
2. `docs/ARCHITECTURE_BIBLE.md`
3. `docs/DEVELOPMENT_ROADMAP.md`
4. The files directly related to the task
5. `git status --short`

If a task involves Next.js behavior, also read the relevant guide in `node_modules/next/dist/docs/` before writing code. This repository uses a Next.js version with breaking changes.

Example:

```powershell
Get-Content OPERATOR_HANDOFF.md
Get-Content docs\ARCHITECTURE_BIBLE.md
Get-Content docs\DEVELOPMENT_ROADMAP.md
git status --short
```

## Mandatory Build Validation

After every coding or documentation session, run:

```powershell
npm run build
```

If TypeScript or build errors appear, fix them before finishing. If the task is documentation-only and build fails because of unrelated existing work, document the failure clearly in `OPERATOR_HANDOFF.md` and in the final handoff.

## Git Workflow

- Check status before editing.
- Identify which changes are yours.
- Stage only intentional files.
- Do not commit unrelated work.
- Do not revert or overwrite work from another agent unless the user explicitly requests it.
- Prefer small commits with focused messages.

Example:

```powershell
git status --short
git add ai/AGENT_RULES.md ai/PROJECT_CONTEXT.md OPERATOR_HANDOFF.md
git commit -m "Add engineering operating system documentation"
git push
```

## Documentation Workflow

After every session:

- Update `OPERATOR_HANDOFF.md`.
- Add or update relevant documentation when architecture, workflow, routes, modules, schema, or conventions change.
- Keep documentation factual. Mark planned items as planned.
- Do not present unimplemented functionality as complete.

## Collaboration Rules

- Never overwrite another agent's work.
- Never remove working functionality without explicit approval.
- Never redesign existing UI unless instructed.
- Always preserve Rock Frost branding.
- Preserve route behavior unless the task explicitly changes routes.
- Preserve mock data until the database integration phase is approved.
- Do not implement payment gateways until approved.
- Do not implement production auth until database integration is ready.

## Architecture Rules

- Multi-tenancy first.
- Organization-first architecture.
- Every business record should be scoped with `organizationId`.
- Use `branchId` where branch-level segmentation is useful.
- Keep marketing and dashboard route groups separate.
- Keep modules reusable and tenant-neutral.
- Module logic should depend on shared platform services, not on another business module directly.

## TypeScript And Build Rules

- Keep TypeScript strict-mode clean.
- Avoid `any` unless there is a strong, documented reason.
- Prefer explicit domain types.
- Keep `npm run build` passing before handoff.
- Do not silence errors to make builds pass.

## Examples

Good behavior:

- Read handoff and architecture docs before editing.
- Add a fleet service under a module boundary.
- Keep new fleet records scoped by `organizationId`.
- Update `OPERATOR_HANDOFF.md` with files changed and build result.

Bad behavior:

- Replacing the dashboard design during a schema task.
- Removing mock data before database integration is approved.
- Changing public branding without explicit instruction.
- Committing another agent's unrelated changes.
- Adding a model without tenant scope for a business feature.
