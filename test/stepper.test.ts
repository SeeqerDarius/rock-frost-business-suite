import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Stepper (the first wizard/stepper primitive in this codebase)", () => {
  const source = read("src/components/ui/stepper.tsx");

  it("marks exactly the current step with aria-current=\"step\" - never every step, never none", () => {
    expect(source).toContain('aria-current={isCurrent ? "step" : undefined}');
  });

  it("owns no navigation state of its own - the caller drives currentStepId, matching this app's URL-driven view-state convention", () => {
    expect(source).not.toMatch(/useState|onClick|"use client"/);
    expect(source).toContain("currentStepId");
  });

  it("shows a checkmark for a completed step and the step number otherwise", () => {
    expect(source).toContain("isComplete ? <Check");
  });
});
