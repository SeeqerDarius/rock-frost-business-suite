# UI Guidelines

These guidelines document the Rock Frost design system direction.

## Brand Consistency

- Preserve Rock Frost branding.
- Do not change logo, brand direction, or visual identity without explicit approval.
- Use premium, calm, operational language.
- Keep marketing and dashboard experiences visually related but functionally distinct.

## Colors

The current interface leans toward a dark SaaS aesthetic with high-contrast text and refined accent colors. Future work should preserve that direction.

Rules:

- Use dark surfaces for dashboard context.
- Use accent colors intentionally for status, action, and focus.
- Do not make the interface a single-hue theme.
- Keep status colors consistent across modules.

## Typography

- Use readable type sizes.
- Keep dashboard headings compact and practical.
- Reserve large display type for marketing hero areas.
- Avoid text overflow in buttons, cards, tables, and sidebars.

## Spacing

- Use consistent spacing increments.
- Keep operational pages dense but not cramped.
- Preserve responsive spacing on mobile.
- Avoid nested card clutter.

## Cards

- Use cards for repeated records, summaries, and focused panels.
- Keep card radius restrained.
- Do not put cards inside cards unless there is a clear functional reason.
- Make card content scannable.

## Buttons

- Primary buttons should represent the main action.
- Secondary buttons should be visually quieter.
- Use icons where they improve recognition.
- Button labels should be short and action-oriented.

## Forms

- Label every field.
- Group related fields.
- Show validation clearly.
- Keep destructive actions behind confirmation.
- Do not ask for data the workflow does not need.

## Tables

- Tables should support scanning and comparison.
- Use consistent column alignment.
- Keep status badges clear.
- On mobile, use horizontal scrolling or responsive card layouts.

## Charts

- Charts should answer operational questions.
- Avoid decorative charts with no decision value.
- Label axes and legends clearly.
- Do not rely on color alone.

## Dashboard

Dashboard pages should prioritize:

- Current operational status
- Recent activity
- Exceptions and alerts
- Fast navigation
- Clear calls to action

Avoid marketing-style hero layouts inside the app dashboard.

## Animations

- Use animation sparingly.
- Prefer subtle transitions for navigation, hover, and state changes.
- Do not use motion that delays operational work.

## Icons

- Use consistent icon style.
- Prefer recognizable icons for common actions.
- Pair unfamiliar icons with labels or tooltips.

## Accessibility

- Maintain contrast.
- Preserve keyboard navigation.
- Use semantic HTML.
- Ensure focus states are visible.
- Respect reduced-motion preferences where relevant.

## Responsive Rules

- Pages must work on mobile and desktop.
- Text must not overlap.
- Buttons must remain tappable.
- Tables must not break layout.
- Sidebars and topbars must adapt cleanly.

## Brand Consistency Checklist

Before finishing UI work:

- Does it still feel like Rock Frost?
- Did any route or workflow change unexpectedly?
- Does it work on mobile?
- Does text fit?
- Does the build pass?
- Is `OPERATOR_HANDOFF.md` updated?
