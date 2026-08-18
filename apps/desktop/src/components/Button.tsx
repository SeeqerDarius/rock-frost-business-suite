import { forwardRef, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ShadcnButtonProps = ComponentProps<typeof ShadcnButton>;

const VARIANT_MAP: Record<ButtonVariant, NonNullable<ShadcnButtonProps["variant"]>> = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  destructive: "destructive",
};

export interface ButtonProps extends Omit<ShadcnButtonProps, "variant"> {
  variant?: ButtonVariant;
  loading?: boolean;
}

/**
 * The one button primitive the whole shell uses, delegating to the real
 * ported shadcn `ui/button.tsx` (same component, same Tailwind classes, as
 * the web app) so this app's buttons render identically. Keeps this app's
 * own simplified variant vocabulary and `loading` convenience prop so the
 * ~60 existing call sites across every module screen did not need touching.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, disabled, children, className, ...rest },
  ref,
) {
  return (
    <ShadcnButton
      ref={ref}
      variant={VARIANT_MAP[variant]}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(loading && "opacity-70", className)}
      {...rest}
    >
      {loading ? <Loader2 className="rf-spin" size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
      {loading ? <span className="rf-sr-only">Loading</span> : null}
    </ShadcnButton>
  );
});
