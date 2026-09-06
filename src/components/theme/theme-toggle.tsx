"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { nextTheme, setThemeOverride } from "@/lib/theme-preference";

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme is undefined until after mount, since the server has no way
  // to know the visitor's system/localStorage preference - rendering the
  // theme-dependent icon before then would mismatch hydration. Same
  // client-only-value pattern as useTrendChartStyle (charts.tsx).
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle color theme"}
      onClick={() => {
        setThemeOverride(window.localStorage);
        setTheme(nextTheme(resolvedTheme));
      }}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
