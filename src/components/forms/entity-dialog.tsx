"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EntityDialogProps {
  trigger: ReactElement;
  title: string;
  description?: string;
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  submitLabel?: string;
}

/**
 * Shared create/edit dialog shell used across every Fleet (and future
 * module) entity page — a form action that redirects back to the same
 * list page on completion (success or error, via a query param) will
 * naturally close this dialog on submit, since the redirect re-renders
 * the whole page tree and this component's open state resets.
 */
export function EntityDialog({ trigger, title, description, action, children, submitLabel = "Save" }: EntityDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form action={action} className="space-y-4">
          {children}
          <Button type="submit" className="w-full">
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
