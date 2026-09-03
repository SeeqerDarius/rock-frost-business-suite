"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PhotoInputPreview({ id }: { id: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return <div className="space-y-3">
    <div className="space-y-1.5"><Label htmlFor={id}>Photo</Label><Input id={id} name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (preview) URL.revokeObjectURL(preview); const file = event.currentTarget.files?.[0]; setPreview(file ? URL.createObjectURL(file) : null); }} /><p className="text-xs text-muted-foreground">JPG, PNG, or WebP, 128 to 8,000 pixels per side, up to 1 MB.</p></div>
    {preview ? <div><p className="mb-2 text-xs font-medium">Square card crop preview</p><Image src={preview} alt="Selected student photo crop preview" width={128} height={128} unoptimized className="size-32 rounded-xl border object-cover" /></div> : null}
    <div className="space-y-1.5"><Label htmlFor={`${id}-focus`}>Crop focus</Label><select id={`${id}-focus`} name="photoCropFocus" defaultValue="attention" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="attention">Automatic face and subject focus</option><option value="centre">Centre</option><option value="north">Top</option><option value="south">Bottom</option></select></div>
  </div>;
}
