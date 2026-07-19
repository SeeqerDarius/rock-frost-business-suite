> **OBSOLETE — ARCHIVED DOCUMENT**
>
> This document describes the previous Rock Frost Business Suite implementation, which was fully retired during the clean rebuild that began 2026-07-19. It is kept for historical reference only.
>
> **Coding agents must NOT follow this document.** It is not authoritative. See the current `docs/` directory and `OPERATOR_HANDOFF.md` at the repository root for the active architecture and roadmap.

# Coding Standards

These standards define how Rock Frost Business Suite should be built.

## Folder Naming

- Use lowercase route folders in `app/`.
- Use route groups for major experiences, such as `(dashboard)` and `(auth)`.
- Use domain folders for module-specific logic.
- Keep shared components in `components/`.
- Keep shared platform logic in `lib/`.
- Keep operating documentation in `ai/`.

## File Naming

- React components: `PascalCase.tsx`
- Utility files: `camelCase.ts` or clear domain names like `session.ts`
- Prisma schema: `prisma/schema.prisma`
- Documentation: `UPPER_SNAKE_CASE.md` for major governance docs, descriptive names for supporting docs

## React Standards

- Prefer function components.
- Keep components small and composable.
- Use props with explicit TypeScript types.
- Keep data shaping outside visual components where possible.
- Do not put business rules in purely presentational components.

## Next.js Standards

- Follow the local Next.js docs in `node_modules/next/dist/docs/` before using APIs that may have changed.
- Keep server code in Server Components, route handlers, server actions, or server-only libraries.
- Do not import Prisma or secrets into Client Components.
- Preserve route groups and existing routes unless explicitly changing them.

## TypeScript Conventions

- Keep strict TypeScript clean.
- Avoid `any`.
- Prefer discriminated unions for statuses and workflows.
- Use explicit return types for exported utilities when helpful.
- Model tenant context explicitly.

## Prisma Conventions

- Business models should include `organizationId`.
- Add `branchId` when records may belong to a branch.
- Include `createdAt` and `updatedAt` for mutable records.
- Use enums for durable statuses.
- Use indexes for tenant-scoped lookups.
- Use relation names only when Prisma needs disambiguation.
- Run `npx prisma format` and `npx prisma generate` after schema changes.

## Component Structure

Preferred component shape:

```tsx
type MetricCardProps = {
  title: string;
  value: string;
};

export function MetricCard({ title, value }: MetricCardProps) {
  return (
    <section>
      <p>{title}</p>
      <strong>{value}</strong>
    </section>
  );
}
```

## Reusable Components

- Reuse dashboard shell components.
- Reuse fleet table, card, and status components.
- Avoid duplicating layout patterns.
- Add abstractions only when they reduce real duplication.

## Import Ordering

Use this order:

1. React and Next.js imports
2. Third-party packages
3. Internal aliases from `@/`
4. Relative imports
5. Type-only imports where practical

## Error Handling

- Return structured errors from APIs.
- Do not leak secrets or internal stack traces to users.
- Validate tenant scope before business operations.
- Prefer clear user-facing messages and detailed server logs.

## Logging

- Keep logs useful and minimal.
- Do not log secrets, tokens, passwords, or full payment details.
- Audit business actions through `AuditLog` when implementation reaches that phase.

## Comments

- Comment why, not what.
- Use comments for complex business rules, tenant boundaries, or security decisions.
- Avoid noisy comments that repeat the code.

## Documentation

- Update docs when behavior, architecture, schema, routes, or workflow changes.
- Keep planned work clearly marked as planned.
- Update `OPERATOR_HANDOFF.md` after each session.

## Commit Message Format

Use concise imperative messages:

- `Add operator handoff log`
- `Add Prisma database foundation`
- `Document engineering operating system`
- `Fix dashboard route protection`

## Branch Strategy

- `main` is the active branch unless a feature branch is explicitly created.
- Use feature branches for risky or long-running work.
- Keep commits focused.
- Avoid mixing UI, schema, auth, and documentation changes in one commit unless the task requires it.

## Testing

Minimum validation:

```powershell
npm run build
```

When relevant:

```powershell
npx tsc --noEmit
npm run lint
npx prisma generate
```

## Performance

- Keep dashboard pages efficient for repeated operational use.
- Avoid unnecessary client-side JavaScript.
- Use Server Components for server data where appropriate.
- Add indexes for common tenant-scoped queries.

## Accessibility

- Use semantic HTML.
- Preserve keyboard navigation.
- Maintain readable contrast.
- Label form controls.
- Do not rely on color alone for status.

## Security

- Tenant isolation is mandatory.
- Read auth from trusted session/cookie context.
- Do not trust client-provided organization IDs without authorization checks.
- Keep secrets server-side.
- Do not implement payment gateways without explicit approval.
