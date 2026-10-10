import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every button that submits a Server Action form must say `type="submit"`.
 *
 * This looks like a style rule and is not. `Button`
 * (src/components/ui/button.tsx) already implements the pending state every
 * one of these needs: it calls `useFormStatus()` and swaps in a spinner,
 * disables itself and sets `aria-busy` while the action is in flight. But it
 * only does that for `type === "submit"`, checked literally:
 *
 *     const isPending = disabled === undefined && type === "submit" && formPending
 *
 * A `<Button>` inside a form with no `type` still submits, because that is
 * the HTML default. It just never matches that condition, so the spinner the
 * component was built to show silently never fires. The person clicking
 * "Approve", "Lock plan" or "Archive" sees nothing happen during a real
 * round trip to Postgres, and clicking again runs a non-idempotent action a
 * second time.
 *
 * 34 buttons across 16 files were in that state, the platform operator's own
 * "Save moderation" among them. The failure is invisible in review precisely
 * because the markup looks right, which is what makes it worth a test rather
 * than a convention.
 *
 * Verified in a browser rather than taken on trust: with the Server Action
 * held open, a changed button ("Issue new digital ID") was observed carrying
 * aria-busy="true" and rendering the spinner for the whole in-flight window.
 */

const ROOTS = ["src/app/app", "src/components"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** Buttons inside `<form action={...}>` that carry no `type` at all. */
function buttonsMissingType(source: string): string[] {
  const found: string[] = [];
  for (const form of source.matchAll(/<form\b[^>]*action=\{[\s\S]*?<\/form>/g)) {
    for (const button of form[0].matchAll(/<Button\b[^>]*?>/g)) {
      const tag = button[0];
      // A Button rendered as a link is not a submit control at all.
      if (tag.includes("nativeButton={false}") || tag.includes("render=")) continue;
      if (tag.includes("type=")) continue;
      found.push(tag.replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return found;
}

describe("Server Action forms give feedback while they run", () => {
  it("has no button that submits without type=\"submit\", so Button's pending spinner always fires", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        for (const tag of buttonsMissingType(readFileSync(file, "utf8"))) {
          offenders.push(`${file}: ${tag}`);
        }
      }
    }
    expect(
      offenders,
      `These buttons submit a Server Action form but never show a pending spinner, because Button only auto-detects pending when type="submit" is passed explicitly:\n\n${offenders.join("\n")}\n`,
    ).toEqual([]);
  });

  it("still reads the condition this rule exists for, so the rule cannot outlive it", () => {
    // If Button ever stops gating on `type === "submit"` the rule above is
    // obsolete and should go, rather than being kept as folklore.
    const button = readFileSync("src/components/ui/button.tsx", "utf8");
    expect(button).toContain("useFormStatus");
    expect(button).toContain('type === "submit"');
  });
});
