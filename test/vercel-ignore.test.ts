import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel source packaging", () => {
  it("ignores only root artifact folders, not nested application report routes", () => {
    const rules = readFileSync(resolve(process.cwd(), ".vercelignore"), "utf8").split(/\r?\n/);
    expect(rules).toContain("/reports/");
    expect(rules).toContain("/output/");
    expect(rules).not.toContain("reports/");
    expect(rules).not.toContain("output/");
  });
});
