"use client";

import { Button } from "@/components/ui/button";

export function ConfirmDeleteButton({ name }: { name: string }) {
  return (
    <Button
      type="submit"
      size="sm"
      variant="destructive"
      onClick={(event) => {
        if (!window.confirm(`Remove ${name} from the customer showcase? This cannot be undone.`)) event.preventDefault();
      }}
    >
      Remove
    </Button>
  );
}
