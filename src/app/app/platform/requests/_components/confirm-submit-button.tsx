"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Wraps a consequential form submission (approve + enable a module, reject
 * a request) behind an explicit confirmation step. `DialogContent` renders
 * through a portal, so the real submit button lives outside the `<form>` in
 * the DOM — it targets the form by `form={formId}` (the native HTML
 * attribute for associating a button with a form it isn't nested inside),
 * which still submits with `name`/`value` exactly as a nested button would.
 */
export function ConfirmSubmitButton({
  formId,
  name,
  value,
  title,
  description,
  confirmLabel,
  triggerLabel,
  variant = "default",
  triggerVariant = "outline",
}: {
  formId: string;
  name?: string;
  value?: string;
  title: string;
  description: string;
  confirmLabel: string;
  triggerLabel: string;
  variant?: "default" | "destructive";
  triggerVariant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            name={name}
            value={value}
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => setOpen(false)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
