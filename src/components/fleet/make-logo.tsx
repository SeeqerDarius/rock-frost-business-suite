import { Icon as CardogIcon, type IconName } from "@cardog-icons/react";
import { cn } from "@/lib/utils";
import { getMakeLogoName, makeBadgeColor, makeInitials } from "@/lib/fleet-vehicle-makes";

/**
 * Renders a make's real manufacturer emblem (MIT-licensed SVG redraws from
 * @cardog-icons/react) when one is available, falling back to a colored
 * initials badge otherwise. Coverage there skews Western/Japanese/Korean -
 * see the comment on VEHICLE_MAKES in src/lib/fleet-vehicle-makes.ts for why
 * Chinese manufacturers still render as initials.
 */
export function MakeLogo({ make, size = 28, className }: { make: string; size?: number; className?: string }) {
  const logoName = getMakeLogoName(make);
  if (logoName) {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center rounded-md bg-white p-1 shadow-sm ring-1 ring-border", className)}
        style={{ width: size, height: size }}
      >
        <CardogIcon name={logoName as IconName} size={size - 8} aria-label={`${make} logo`} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-md font-semibold text-white", className)}
      style={{ width: size, height: size, background: makeBadgeColor(make), fontSize: Math.max(size * 0.36, 9) }}
    >
      {makeInitials(make)}
    </span>
  );
}
