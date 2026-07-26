"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function OrganizationThemeSync({ theme }: { theme?: "system" | "light" | "dark" }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [setTheme, theme]);
  return null;
}
