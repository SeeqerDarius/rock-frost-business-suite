"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Native multipart POST to the upload route handler (Server Actions are
 * capped at 2 MB). The server re-validates type, size, content signature,
 * permission, and organization.
 */
export function UploadDocumentDialog({ contractId, documentTypes, defaultType }: { contractId: string; documentTypes: { value: string; label: string }[]; defaultType: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(null); setSubmitting(false); }}>
      <DialogTrigger render={<Button size="sm"><FileUp />Upload</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF, Word, Excel, text, or image, up to 4 MB. A file with the same type and title becomes a new version.</DialogDescription>
        </DialogHeader>
        <form
          method="post"
          action="/api/contracts/documents"
          encType="multipart/form-data"
          className="space-y-4"
          onSubmit={(event) => {
            const file = (event.currentTarget.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
            if (file && file.size > MAX_BYTES) { event.preventDefault(); setError("Files must be 4 MB or smaller."); return; }
            setSubmitting(true);
          }}
        >
          <input type="hidden" name="contractId" value={contractId} />
          <div className="space-y-1.5"><Label htmlFor="d-type" required>Type</Label><select id="d-type" name="documentType" defaultValue={defaultType} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="d-title" required>Title</Label><Input id="d-title" name="title" required placeholder="e.g. Signed master agreement" /></div>
          <div className="space-y-1.5"><Label htmlFor="d-file" required>File</Label><Input id="d-file" name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp" /></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Uploading…" : "Upload"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
