export const THEME_OVERRIDE_STORAGE_KEY = "rf-theme-user-override";

/**
 * True once a user has explicitly picked light/dark for themselves via the
 * header toggle. Organization Settings' "Interface theme" applies its choice
 * to every member's session on load (OrganizationThemeSync) - once a user has
 * made their own choice, that personal preference should stick instead of
 * being silently reset back to the workspace default on their next visit.
 */
export function hasThemeOverride(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(THEME_OVERRIDE_STORAGE_KEY) === "1";
}

export function setThemeOverride(storage: Pick<Storage, "setItem">): void {
  storage.setItem(THEME_OVERRIDE_STORAGE_KEY, "1");
}

/** The theme to switch to when the toggle button is pressed. */
export function nextTheme(currentResolvedTheme: string | undefined): "light" | "dark" {
  return currentResolvedTheme === "dark" ? "light" : "dark";
}
