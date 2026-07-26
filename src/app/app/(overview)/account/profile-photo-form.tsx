"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { uploadProfilePicture } from "./actions";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
}

export function ProfilePhotoForm({ image, name, email }: {
  image: string | null;
  name: string | null;
  email: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setSaved(false);
    formData.set("_client", "1");
    const result = await uploadProfilePicture(formData);
    if (result?.ok) {
      window.dispatchEvent(new Event("profile-updated"));
      router.refresh();
      setSaved(true);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setError(result?.error ?? "The image could not be uploaded.");
    }
    setPending(false);
  }

  return (
    <form action={submit} className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <Avatar className="size-24 ring-4 ring-muted">
          {image ? <AvatarImage src={image} alt={name ? `${name} profile picture` : "Profile picture"} /> : null}
          <AvatarFallback className="text-2xl font-semibold">{initials(name, email)}</AvatarFallback>
        </Avatar>
        <span className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
          <Camera className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-medium">Choose a professional headshot</p>
          <p className="text-sm text-muted-foreground">JPG, PNG, or WebP. Maximum file size 1 MB.</p>
        </div>
        <input
          ref={inputRef}
          id="profile-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          required
          onChange={(event) => {
            setFileName(event.target.files?.[0]?.name ?? "");
            setError("");
            setSaved(false);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden="true" />Choose image
          </Button>
          <Button type="submit" disabled={!fileName || pending}>
            {pending ? "Uploading…" : "Save photo"}
          </Button>
          {fileName ? <span className="max-w-52 truncate text-sm text-muted-foreground">{fileName}</span> : null}
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {saved ? <p className="flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 className="size-4" />Profile photo updated.</p> : null}
      </div>
    </form>
  );
}
