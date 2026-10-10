export const THEME_USER_OVERRIDE_STORAGE_KEY = "rf-theme-user-override";

export function hasThemeUserOverride(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(THEME_USER_OVERRIDE_STORAGE_KEY) === "1";
}

export function markThemeUserOverride(storage: Pick<Storage, "setItem">): void {
  storage.setItem(THEME_USER_OVERRIDE_STORAGE_KEY, "1");
}

/** The explicit light/dark value to apply when the header toggle is pressed. */
export function nextColorTheme(resolvedTheme: string | undefined): "light" | "dark" {
  return resolvedTheme === "dark" ? "light" : "dark";
}
