"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { hasThemeOverride } from "@/lib/theme-preference";

export function OrganizationThemeSync({ theme }: { theme?: "system" | "light" | "dark" }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    // A user who has explicitly picked a theme for themselves via the header
    // toggle keeps that choice - the workspace default only applies until
    // someone overrides it personally.
    if (theme && !hasThemeOverride(window.localStorage)) setTheme(theme);
  }, [setTheme, theme]);
  return null;
}
