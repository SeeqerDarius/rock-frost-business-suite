import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("public website navigation", () => {
  const header = read("src/components/layout/public-header.tsx");
  const mobileMenu = read("src/components/layout/public-mobile-menu.tsx");
  const links = read("src/components/layout/public-nav-links.ts");

  it("keeps every public destination reachable when the desktop navigation collapses", () => {
    expect(header).toContain("hidden items-center gap-5");
    expect(header).toContain("lg:flex");
    expect(header).toContain("PublicMobileMenu");
    expect(mobileMenu).toContain('aria-label="Mobile site navigation"');
    expect(mobileMenu).toContain("<SheetClose");
    for (const href of ["/solutions", "/modules", "/pricing", "/industries", "/company", "/resources", "/contact"]) {
      expect(links).toContain(`href: "${href}"`);
    }
    expect(mobileMenu).toContain('href="/subscribe"');
    expect(mobileMenu).toContain('href="/login"');
  });

  it("uses the shared sheet with labelled content for accessible mobile navigation", () => {
    expect(mobileMenu).toContain("<Sheet>");
    expect(mobileMenu).toContain("<SheetTitle>");
    expect(mobileMenu).toContain("<SheetDescription>");
    expect(mobileMenu).toContain('<SheetContent side="right"');
  });
});
