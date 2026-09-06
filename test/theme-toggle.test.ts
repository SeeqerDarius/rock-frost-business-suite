import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasThemeOverride, nextTheme, setThemeOverride, THEME_OVERRIDE_STORAGE_KEY } from "@/lib/theme-preference";

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

describe("theme-preference", () => {
  it("nextTheme alternates light and dark", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  it("treats an unresolved theme (undefined, e.g. before mount) as not-dark, so the first press goes to dark", () => {
    expect(nextTheme(undefined)).toBe("dark");
  });

  it("hasThemeOverride is false until setThemeOverride is called, then stays true", () => {
    const storage = memoryStorage();
    expect(hasThemeOverride(storage)).toBe(false);
    setThemeOverride(storage);
    expect(hasThemeOverride(storage)).toBe(true);
    expect(storage.getItem(THEME_OVERRIDE_STORAGE_KEY)).toBe("1");
  });
});

/**
 * Adds a personal dark/light toggle to both the authenticated app header and
 * the public marketing header. The one real wrinkle: Organization Settings'
 * "Interface theme" (src/app/app/(overview)/organization/settings/page.tsx)
 * already applies a workspace-wide theme to every member's session on load
 * via OrganizationThemeSync - without a guard, that would silently reset a
 * user's manual toggle back to the workspace default on their next visit.
 * Fixed by recording an explicit user override the first time someone
 * presses the toggle, which OrganizationThemeSync then respects.
 */
describe("theme toggle is wired into both headers and respects a user's own choice over the workspace default", () => {
  const toggle = readFileSync("src/components/theme/theme-toggle.tsx", "utf8");
  const orgSync = readFileSync("src/components/theme/organization-theme-sync.tsx", "utf8");
  const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
  const publicHeader = readFileSync("src/components/layout/public-header.tsx", "utf8");

  it("ThemeToggle uses next-themes and records an override on click, before switching", () => {
    expect(toggle).toContain('"use client"');
    expect(toggle).toContain('import { useTheme } from "next-themes"');
    expect(toggle).toContain("setThemeOverride(window.localStorage)");
    expect(toggle).toContain("setTheme(nextTheme(resolvedTheme))");
  });

  it("ThemeToggle avoids a hydration mismatch via useSyncExternalStore, not a setState-in-effect mount gate", () => {
    expect(toggle).toContain("useSyncExternalStore(noopSubscribe, () => true, () => false)");
    expect(toggle).toMatch(/mounted\s*&&\s*resolvedTheme === "dark"/);
  });

  it("OrganizationThemeSync no longer unconditionally overwrites a user's own theme choice", () => {
    expect(orgSync).toContain("hasThemeOverride(window.localStorage)");
    expect(orgSync).toContain('if (theme && !hasThemeOverride(window.localStorage)) setTheme(theme);');
  });

  it("the toggle renders in the authenticated app header and the public marketing header", () => {
    expect(appShell).toContain("<ThemeToggle />");
    expect(publicHeader).toContain("<ThemeToggle />");
  });
});
