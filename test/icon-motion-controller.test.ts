import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/icons/icon-motion-controller.tsx"), "utf8");

describe("shared icon motion controller", () => {
  it("covers intent, focus, touch activation, completion, and replay protection", () => {
    for (const value of ["HOVER_INTENT_MS = 110", "REPLAY_GUARD_MS = 650", "COMPLETION_MS = 1_700", 'addEventListener("focusin"', 'addEventListener("pointerdown"', 'event.pointerType === "touch"']) {
      expect(source).toContain(value);
    }
  });

  it("excludes disabled, opted-out, decorative, loading, and reduced-motion cases", () => {
    for (const value of ['[aria-disabled="true"]', '[data-icon-motion="off"]', '.lucide:not(.animate-spin)', 'closest<HTMLElement>(CONTROL_SELECTOR)', 'matchMedia("(prefers-reduced-motion: reduce)")']) {
      expect(source).toContain(value);
    }
  });
});
