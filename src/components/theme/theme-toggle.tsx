"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { markThemeUserOverride, nextColorTheme } from "@/lib/theme-preference";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = resolvedTheme !== undefined;

  const nextTheme = nextColorTheme(resolvedTheme);
  const label = nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={mounted ? label : "Switch color theme"}
      disabled={!mounted}
      onClick={() => {
        markThemeUserOverride(window.localStorage);
        setTheme(nextTheme);
      }}
    >
      {mounted ? (
        nextTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />
      ) : (
        <span className="size-4" aria-hidden />
      )}
    </Button>
  );
}
