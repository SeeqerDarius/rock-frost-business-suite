import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  THEME_USER_OVERRIDE_STORAGE_KEY,
  hasThemeUserOverride,
  markThemeUserOverride,
  nextColorTheme,
} from "@/lib/theme-preference";

describe("theme preference helpers", () => {
  it("treats light as the next theme when the resolved theme is dark", () => {
    expect(nextColorTheme("dark")).toBe("light");
  });

  it("treats dark as the next theme when the resolved theme is light, system, or still unknown", () => {
    expect(nextColorTheme("light")).toBe("dark");
    expect(nextColorTheme("system")).toBe("dark");
    expect(nextColorTheme(undefined)).toBe("dark");
  });

  it("records and detects a device-local user override without touching other storage keys", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };

    expect(hasThemeUserOverride(adapter)).toBe(false);
    markThemeUserOverride(adapter);
    expect(storage.get(THEME_USER_OVERRIDE_STORAGE_KEY)).toBe("1");
    expect(hasThemeUserOverride(adapter)).toBe(true);
  });
});

describe("theme toggle chrome", () => {
  const toggle = readFileSync("src/components/theme/theme-toggle.tsx", "utf8");
  const orgSync = readFileSync("src/components/theme/organization-theme-sync.tsx", "utf8");
  const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
  const publicHeader = readFileSync("src/components/layout/public-header.tsx", "utf8");
  const authLayout = readFileSync("src/app/(auth)/layout.tsx", "utf8");
  const loginPage = readFileSync("src/app/(auth-login)/login/page.tsx", "utf8");
  const orgSettings = readFileSync("src/app/app/(overview)/organization/settings/page.tsx", "utf8");

  it("is a client button that persists an override and calls next-themes setTheme", () => {
    expect(toggle).toContain('"use client"');
    expect(toggle).toContain("useTheme");
    expect(toggle).toContain("markThemeUserOverride(window.localStorage)");
    expect(toggle).toContain("setTheme(nextTheme)");
    expect(toggle).toContain("Switch to dark mode");
    expect(toggle).toContain("Switch to light mode");
  });

  it("does not let the organization default overwrite a device-local theme choice", () => {
    expect(orgSync).toContain("hasThemeUserOverride(window.localStorage)");
    expect(orgSync).toContain("if (theme) setTheme(theme)");
  });

  it("appears in the authenticated shell, public header, login, and password-reset chrome", () => {
    expect(appShell).toContain("<ThemeToggle />");
    expect(publicHeader).toContain("<ThemeToggle />");
    expect(authLayout).toContain("<ThemeToggle />");
    expect(loginPage).toContain("<ThemeToggle />");
  });

  it("describes the organization theme setting as a default, not a lock on every member", () => {
    expect(orgSettings).toContain("Default appearance for members who have not chosen their own theme");
  });
});
