# UI/UX Refresh

## Shared-agent coordination

This refresh is intentionally split so Codex and any external Claude session can work without overlapping edits.

- **Codex ownership:** authenticated `AppShell`, desktop/mobile sidebar behavior, `SidebarNav`, navigation logo behavior, semantic brand tokens, and Hotel/School overview hierarchy.
- **Claude review lane:** critique the resulting interaction model, audit public acquisition pages and small-size RF icon treatment, and propose follow-up changes without editing Codex-owned files until the Codex commit is visible.
- **Shared constraint:** inspect `git status` and the latest commit before editing. Preserve `output/` and `reports/`. Record any follow-up ownership in this document and `OPERATOR_HANDOFF.md`.

## Product direction

Rock Frost should remain restrained and operational, but it must no longer look like an unbranded neutral template. The RF blue is a semantic accent for active navigation, primary actions, focus, KPI emphasis, and selected states. It is not a decorative gradient or a replacement for the neutral information hierarchy.

## Sidebar behavior

- Desktop navigation is persistent and user-collapsible.
- The collapsed state preserves icon navigation, active-state visibility, accessible labels, and tooltips.
- The preference is saved locally and restored after hydration.
- Mobile navigation remains a modal sheet with full labels and closes after route selection.
- The active route uses both shape and RF-blue contrast; color is not the only active-state signal.
- The collapse control remains keyboard accessible and clearly communicates the resulting state.

## Dashboard hierarchy

Hotel and School overviews are operational landing pages, not collections of identical cards. Their first row presents real headline metrics with direct navigation. A secondary workflow panel exposes the module's most frequent tasks and the most important operational domains without fabricating data.

## Acceptance criteria

1. Sidebar expands/collapses without hiding navigation access or breaking mobile navigation.
2. Active routes remain obvious in light and dark themes.
3. At 1024px and above, the content area gains usable width when the sidebar is collapsed.
4. Hotel and School overview cards are fully clickable, keyboard focusable links with descriptive labels.
5. The implementation uses semantic tokens and Lucide icons, with no gradients, glassmorphism, or invented metrics.
6. Lint, strict TypeScript, unit tests, and the production build pass before release.

## Codex tranche status

Implemented on 2026-08-03: single-active-route matching, accessible grouped navigation, persistent desktop collapse, constrained mobile navigation, contextual header labels, RF-blue semantic tokens, optimized small chrome logo usage, and upgraded Hotel/School overview hierarchy. Validation passed strict TypeScript, ESLint, 33 unit files / 212 tests, and the 160-page production build. Claude's review lane remains public acquisition presentation and a visual critique of the small-format RF mark after this tranche is committed.
