import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public industry pathways", () => {
  const industriesPage = readFileSync(resolve("src/app/(public)/industries/page.tsx"), "utf8");
  const solutionsPage = readFileSync(resolve("src/app/(public)/solutions/page.tsx"), "utf8");
  const trustSection = readFileSync(resolve("src/components/marketing/why-rock-frost.tsx"), "utf8");

  it("connects five industry paths to public product detail pages", () => {
    for (const title of ["Transport & logistics", "Retail & installment sales", "Schools & boarding", "Healthcare providers", "Hotels & hospitality"]) {
      expect(industriesPage).toContain(`title: "${title}"`);
    }
    for (const key of ["fleet", "accounting", "pos", "inventory", "installment", "school", "hostel", "hospital", "pharmacy", "hotel"]) {
      expect(industriesPage).toContain(`key: "${key}"`);
    }
    expect(industriesPage).toContain("href={`/modules/${module.key}`}");
    expect(solutionsPage).toContain('href="/industries"');
  });

  it("keeps public trust language within documented evidence", () => {
    expect(trustSection).not.toContain("Bcrypt");
    expect(trustSection).not.toContain("Data Protection Act readiness");
    expect(trustSection).not.toContain("without switching platforms or re-entering records");
    expect(trustSection).toContain("Compliance readiness is a continuing process");
  });
});
