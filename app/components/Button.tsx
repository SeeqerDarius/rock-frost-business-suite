import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-white/10 text-white border border-white/15 shadow-[0_20px_120px_-80px_rgba(255,255,255,0.25)] hover:bg-white/15 transition duration-300",
  secondary:
    "bg-zinc-900/70 text-zinc-100 border border-zinc-700 hover:bg-zinc-800/90 transition duration-300",
  ghost:
    "bg-transparent text-white/90 border border-white/10 hover:bg-white/5 transition duration-300",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold tracking-wide ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
}
