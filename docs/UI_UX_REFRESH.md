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

## Claude review lane: findings (2026-08-03)

Reviewed against commit `fa5494f` ("Refine workspace navigation and module UX") without editing any Codex-owned file (`app-shell.tsx`, `sidebar-nav.tsx`, `active-navigation.ts`, Hotel/School overview pages). No code was changed in this pass; findings are proposed follow-ups.

**Interaction model (`AppShell`/`SidebarNav`) — sound overall.** Segment-boundary active matching, collapsed-state tooltips, and the mobile sheet all behave as specified in the acceptance criteria above. Two follow-ups, neither blocking:
1. `OrganizationSwitcher` is only rendered when the sidebar is expanded (`app-shell.tsx:80`). A multi-org user who collapses the sidebar loses the switcher entirely, with no icon-only fallback or access via `UserMenu`. Worth a small follow-up so multi-org accounts always have a switch affordance.
2. The collapsed/expanded preference intentionally restores from `localStorage` after hydration (`getServerSidebarPreference` always returns `false`), which is documented above as by-design. This does mean a user who left the sidebar collapsed sees one visible expand-to-collapse flash on every full page load. If that's ever worth eliminating, the standard fix is a cookie + a small blocking inline script (the pattern `next-themes` uses for dark mode) rather than `localStorage` alone — no action needed now, just noting the mechanism for later.

**Public acquisition pages — consistent, nothing broken.** Home, Solutions, Modules, Industries, Company, and Contact all share the same `Card`/section rhythm and `moduleRegistry`-driven content, so there's no drift between them. One polish gap: `PublicHeader`'s nav links (`public-header.tsx`) have no active-route styling, unlike the authenticated sidebar's deliberate shape+color active state. Low priority, but it's the one place the public site reads as less finished than the authenticated shell.

**Small-format RF icon treatment — the real finding.** The RF mark is inconsistent across the icons actually in use:
- `src/app/icon.png` (the browser-tab favicon, and also the literal image `Logo` renders at 30x30px in every sidebar/header instance across the whole app) uses a flat mark on a light background.
- `src/app/apple-icon.png` and `public/icon-192.png`/`icon-512.png` (PWA/iOS home-screen icons, declared in `public/manifest.webmanifest`) use a different, more polished treatment: a chrome/gradient RF mark on a dark-navy rounded-square backdrop that matches the manifest's `background_color: "#020306"` / `theme_color: "#08b2ec"`.
- Because `icon.png` has a light background baked in, it renders as a bright white square inside the dark sidebar in dark mode (`.dark`'s `--sidebar: oklch(0.205 0 0)`), clashing with the rest of the chrome.
- `public/rf logo.png` — a higher-fidelity chrome RF mark, no baked-in background — has zero references anywhere in `src/`. It's an orphaned asset, and its filename contains a literal space, which would need encoding if ever linked directly.
- The JSON-LD `Organization.logo` in `src/app/(public)/layout.tsx:17` points at `public/RFG.png`, a decorative mascot/poster illustration with a baked-in tagline ("Turning ideas into infinite possibilities"), not a square brand mark. That doesn't fit Google's structured-data logo guidance and may hurt rich-result eligibility.

**Applied (2026-08-03, on explicit request):** `src/app/icon.png` is now a copy of `apple-icon.png` (180x180, same dark-navy chrome mark), so the favicon, in-app `Logo` instances, and PWA icons are one consistent asset. The JSON-LD `logo` field in `src/app/(public)/layout.tsx` now points at `icon-512.png` instead of `RFG.png`. `public/rf logo.png` remains unreferenced and was left in place rather than deleted. Not build- or visually-verified — no Node.js/npm was available in the session that made this change; see `OPERATOR_HANDOFF.md` for the environment note. Whoever next has a working toolchain should run `npm run build` and eyeball the sidebar favicon/tab icon in light and dark mode.
# Visible authenticated navigation feedback

The authenticated root retains `app/loading.tsx` as its server-streaming fallback. Because production Next.js links are prefetched, fast route changes may never suspend and therefore may not display that fallback. `AppNavigationLoader` adds a short RF-branded transition on valid internal link navigation so users receive consistent feedback without disabling prefetching or delaying data requests. External/new-tab/download/same-page interactions are excluded, and the app-wide reduced-motion policy applies.
