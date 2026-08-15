import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "var(--rf-primary)", color: "var(--rf-primary-foreground)", border: "1px solid transparent" },
  secondary: { background: "var(--rf-card)", color: "var(--rf-card-foreground)", border: "1px solid var(--rf-border)" },
  ghost: { background: "transparent", color: "var(--rf-foreground)", border: "1px solid transparent" },
  destructive: { background: "var(--rf-destructive)", color: "var(--rf-destructive-foreground)", border: "1px solid transparent" },
};

/**
 * The one button primitive the whole shell uses. `loading` disables the
 * button and announces "Loading" via aria-live so a screen-reader user
 * gets the same feedback a sighted user gets from the spinner, per the
 * accessible-loading-states requirement.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, disabled, children, style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "0.625rem 1.125rem",
        borderRadius: "var(--rf-radius-md)",
        fontSize: "0.875rem",
        fontWeight: 600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "opacity 120ms ease, transform 120ms ease",
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader2 className="rf-spin" size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
      {loading ? <span className="rf-sr-only">Loading</span> : null}
    </button>
  );
});
