import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("icon animation timing", () => {
  it("keeps the universal draw-in slow enough to read clearly", () => {
    expect(css).toContain("animation: lucide-draw-in 1000ms");
    expect(css).toContain(":nth-child(2) { animation-delay: 120ms; }");
    expect(css).toContain(":nth-child(6) { animation-delay: 600ms; }");
  });

  it("keeps bespoke icon interactions aligned with the slower motion language", () => {
    expect(css).toContain("transition: transform 420ms");
    expect(css).toContain("transition: transform 520ms");
  });
});
