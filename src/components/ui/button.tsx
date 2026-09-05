"use client"

import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import type { VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button-variants"

function Button({
  className,
  variant = "default",
  size = "default",
  type,
  disabled,
  pendingLabel,
  "aria-label": ariaLabel,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shown in place of `children` while pending, instead of the default bare spinner. */
    pendingLabel?: ReactNode
  }) {
  const { pending: formPending } = useFormStatus()
  // Auto-detected pending is only for a plain submit button that hasn't
  // already taken `disabled` over itself - a caller passing its own
  // `disabled` (PaySubmitButton, and any other bespoke pending wrapper) is
  // already managing this explicitly and must never get a second, layered
  // spinner from here. useFormStatus itself is safe to call unconditionally:
  // outside any <form>, or for a non-submit button, it reports pending:false.
  const isPending = disabled === undefined && type === "submit" && formPending
  // The default bare-spinner pending state has no text content - without a
  // fallback label, a screen reader would announce the button as unlabeled
  // for the whole pending window.
  const pendingAriaLabel = isPending && !ariaLabel && typeof pendingLabel !== "string" ? "Loading" : ariaLabel
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      disabled={disabled ?? isPending}
      aria-busy={isPending || undefined}
      aria-label={pendingAriaLabel}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {isPending ? (pendingLabel ?? <LoaderCircle className="animate-spin" aria-hidden="true" />) : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
