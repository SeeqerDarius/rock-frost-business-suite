import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * User asked for the homepage hero to get an animated illustration in the
 * same technical style as a competitor's stroke-dasharray "draw itself in"
 * reveal (found by inspecting their DevTools), but explicitly not the same
 * subject matter (their illustration was an unrelated empty-state cube) -
 * this one is original artwork themed on Rock Frost's own "independent
 * modules, one platform" positioning (this hero's own headline).
 */
describe("homepage hero: module-blocks illustration", () => {
  const homepage = readFileSync(resolve("src/app/(public)/page.tsx"), "utf8");
  const illustration = readFileSync(resolve("src/components/marketing/module-blocks-illustration.tsx"), "utf8");
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");

  it("is wired into the hero's own children slot, not a separate section", () => {
    expect(homepage).toContain("<ModuleBlocksIllustration");
    expect(homepage).toContain("</PublicHero>");
  });

  it("computes an exact per-element dasharray from its own geometry rather than reusing the icon system's shared guessed constant", () => {
    // Every hexagon edge and spoke here has an exactly known length (`r`),
    // since the component fully controls its own geometry - unlike the
    // universal icon draw-in reveal, which has to share one safe constant
    // across 160 externally-defined icons it doesn't control.
    expect(illustration).toContain("6 * block.r");
    expect(illustration).not.toContain("stroke-dasharray: 100");
  });

  it("plays automatically on load via its own animation class, not the hover-triggered icon rule", () => {
    expect(illustration).toContain("module-block-draw");
    expect(css).toContain("@keyframes module-block-draw");
    expect(css).not.toContain(":hover .module-block-draw");
  });

  it("is original hand-built geometry, not an imported icon or asset", () => {
    expect(illustration).not.toContain("lucide-react");
    expect(illustration).not.toContain("import Image");
  });
});
