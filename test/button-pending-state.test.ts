import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * User report: clicking a button that's submitting a form shows no loading
 * feedback at all, which invites repeated clicks. Only 5 files in the whole
 * codebase used useFormStatus/useTransition before this fix, while 228 files
 * import the shared Button component - centralizing pending-state support
 * there retroactively covers every plain <Button type="submit"> call site
 * with zero per-call-site changes.
 */
describe("Button native pending-state support", () => {
  const button = readFileSync("src/components/ui/button.tsx", "utf8");

  it("is a client component that reads the nearest form's pending state via useFormStatus", () => {
    expect(button).toContain('"use client"');
    expect(button).toContain('import { useFormStatus } from "react-dom"');
    expect(button).toContain("const { pending: formPending } = useFormStatus()");
  });

  it("only auto-derives pending for a submit button whose caller hasn't already taken disabled over itself", () => {
    // A caller (PaySubmitButton, etc.) that already passes its own `disabled`
    // is managing pending state itself and must never get a second, layered
    // spinner injected here.
    expect(button).toContain('const isPending = disabled === undefined && type === "submit" && formPending');
    expect(button).toContain("disabled={disabled ?? isPending}");
  });

  it("shows a spinner (or an explicit pendingLabel) in place of children while pending", () => {
    expect(button).toContain("LoaderCircle");
    expect(button).toContain("animate-spin");
    expect(button).toContain("pendingLabel");
  });

  it("falls back to an accessible aria-label while pending with only the bare spinner, so it isn't announced as unlabeled", () => {
    expect(button).toContain('"Loading"');
    expect(button).toContain("aria-label={pendingAriaLabel}");
  });
});

describe("EntityDialog delegates pending state to Button instead of a bespoke local implementation", () => {
  const entityDialog = readFileSync("src/components/forms/entity-dialog.tsx", "utf8");

  it("no longer hand-rolls its own useFormStatus-based SubmitButton", () => {
    expect(entityDialog).not.toContain("useFormStatus");
    expect(entityDialog).not.toContain("function SubmitButton");
  });

  it("still renders exactly one submit button per dialog form", () => {
    expect(entityDialog).toContain('<Button type="submit" className="w-full">{submitLabel}</Button>');
  });
});
