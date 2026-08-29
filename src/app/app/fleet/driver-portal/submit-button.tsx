"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsOffline } from "./offline-banner";
import type { ComponentProps } from "react";

/**
 * Shared submit button for every form on this page that must not be double-
 * submitted - disables itself and shows a spinner the instant the form's own
 * pending state goes true, closing the gap between "clicked" and "server has
 * acknowledged the request" where a duplicate click would otherwise fire a
 * second submission.
 */
export function PaySubmitButton({
  label,
  pendingLabel,
  ...props
}: { label: string; pendingLabel: string } & Omit<ComponentProps<typeof Button>, "type" | "disabled" | "aria-disabled">) {
  const { pending } = useFormStatus();
  const isOffline = useIsOffline();
  const disabled = pending || isOffline;
  return (
    <Button type="submit" disabled={disabled} aria-disabled={disabled} {...props}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : isOffline ? "Offline" : label}
    </Button>
  );
}
