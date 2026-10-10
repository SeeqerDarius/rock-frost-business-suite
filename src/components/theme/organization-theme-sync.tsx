"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { hasThemeUserOverride } from "@/lib/theme-preference";

export function OrganizationThemeSync({ theme }: { theme?: "system" | "light" | "dark" }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (hasThemeUserOverride(window.localStorage)) return;
    if (theme) setTheme(theme);
  }, [setTheme, theme]);
  return null;
}
