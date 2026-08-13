import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("shared public design system", () => {
  it("applies the atmospheric public background at layout scope", () => {
    expect(read("src/app/(public)/layout.tsx")).toContain("public-site");
    const css = read("src/app/globals.css");
    expect(css).toContain(".public-site");
    expect(css).toContain(".public-display");
    expect(css).toContain(".public-panel");
  });

  it("uses the shared hero across every primary public surface", () => {
    for (const path of ["page.tsx", "company/page.tsx", "solutions/page.tsx", "industries/page.tsx", "modules/page.tsx", "pricing/page.tsx", "contact/page.tsx", "modules/[moduleKey]/page.tsx"]) {
      expect(read(`src/app/(public)/${path}`)).toContain("<PublicHero");
    }
  });
});
