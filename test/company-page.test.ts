import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public company positioning", () => {
  const source = readFileSync(resolve("src/app/(public)/company/page.tsx"), "utf8");

  it("presents the wider technology-services capability and selected work", () => {
    for (const text of ["Digital commerce", "Web and product engineering", "HR Network / Connect", "Blend & Beam", "Bespoke technology solutions"]) {
      expect(source).toContain(text);
    }
  });

  it("describes Ghana data protection obligations without claiming automatic compliance", () => {
    expect(source).toContain("Data Protection Act, 2012 (Act 843)");
    expect(source).toContain("Each client remains responsible");
    expect(source).not.toContain("guarantees compliance");
  });

  it("uses the shared editorial hero instead of the outlined eyebrow badge", () => {
    expect(source).toContain("<PublicHero eyebrow=\"Rock Frost Technologies · Ghana\"");
    expect(source).not.toContain("rounded-full px-3 py-1");
  });
});
