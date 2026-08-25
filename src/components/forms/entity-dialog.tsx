"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EntityDialogProps {
  trigger: ReactElement;
  title: string;
  description?: string;
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  submitLabel?: string;
  /** Overrides the dialog's default `sm:max-w-lg` width for forms with more fields than the usual short entity form. */
  contentClassName?: string;
}

/**
 * Must be a child of the <form> it submits, not rendered alongside it -
 * useFormStatus only reports the nearest parent form's pending state when
 * called from a descendant component, never the component that renders the
 * <form> element itself.
 */
function SubmitButton({ submitLabel }: { submitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? "Saving..." : submitLabel}
    </Button>
  );
}

/**
 * Shared create/edit dialog shell used across every Fleet (and future
 * module) entity page: a form action that redirects back to the same
 * list page on completion (success or error, via a query param) will
 * naturally close this dialog on submit, since the redirect re-renders
 * the whole page tree and this component's open state resets.
 */
export function EntityDialog({ trigger, title, description, action, children, submitLabel = "Save", contentClassName }: EntityDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className={cn("sm:max-w-lg", contentClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form action={action} className="space-y-4">
          {children}
          <SubmitButton submitLabel={submitLabel} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
