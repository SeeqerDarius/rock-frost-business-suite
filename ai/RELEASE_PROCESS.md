# Release Process

## Development Flow

Every change moves through:

1. Idea
2. Planning
3. Architecture
4. Implementation
5. Testing
6. Documentation
7. Code review
8. Deployment
9. Production monitoring
10. Bug fix or follow-up

## Idea

Capture the business problem, target user, and expected outcome. Avoid jumping into implementation before the scope is clear.

## Planning

Define:

- Objective
- Files likely affected
- Route impact
- Data impact
- Tenant impact
- Risks
- Acceptance checks

## Architecture

Use `docs/ARCHITECTURE_BIBLE.md` as the source of truth. Record durable decisions in `ai/DECISION_LOG.md`.

Architecture review should answer:

- Does this preserve multi-tenancy?
- Does this belong in core platform or a module?
- Does this preserve marketing/dashboard separation?
- Does this require schema, auth, permissions, audit, or notifications?

## Implementation

Keep implementation focused. Do not redesign unrelated UI, remove routes, or replace mock data unless approved.

## Testing

Minimum check:

```powershell
npm run build
```

Additional checks when relevant:

```powershell
npx tsc --noEmit
npm run lint
npx prisma generate
```

## Documentation

Update documentation when any of these change:

- Architecture
- Routes
- Schema
- Auth behavior
- Module behavior
- Release workflow
- Coding standards
- Known issues

Always update `OPERATOR_HANDOFF.md`.

## Code Review

Review for:

- Tenant isolation
- TypeScript correctness
- Route stability
- Security
- Accessibility
- Performance
- Build status
- Documentation updates

## Deployment

Before deployment:

- Confirm build passes.
- Confirm required environment variables.
- Confirm no secrets are committed.
- Confirm known issues are documented.
- Confirm route behavior is expected.

## Production

Production changes should be conservative. Monitor critical routes, auth behavior, contact/demo forms, and future database-backed flows.

## Bug Fix

Bug fixes should:

- Identify the failing behavior.
- Keep the fix focused.
- Add validation where practical.
- Update handoff with the bug, fix, and build result.

## Versioning

Until formal releases begin, use commit history and deployment notes. When release versions are introduced, prefer semantic versioning:

- Major: breaking behavior or architecture
- Minor: new feature or module capability
- Patch: bug fix or documentation correction

## Rollback

Rollback when production behavior is materially broken and a fast fix is riskier than reverting.

Rollback steps:

1. Identify the deployment or commit.
2. Confirm the rollback target.
3. Preserve logs and error evidence.
4. Roll back through the hosting platform or Git.
5. Document the incident and next fix.

## Hotfixes

Hotfixes are for urgent production issues only. Keep them minimal, test with `npm run build`, deploy carefully, then follow up with a normal review and documentation update.
