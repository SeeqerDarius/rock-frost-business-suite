import type { HTMLAttributes } from "react";

export function Card({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        background: "var(--rf-card)",
        color: "var(--rf-card-foreground)",
        border: "1px solid var(--rf-border)",
        borderRadius: "var(--rf-radius-lg)",
        boxShadow: "var(--rf-shadow-sm)",
        padding: "1.25rem",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
