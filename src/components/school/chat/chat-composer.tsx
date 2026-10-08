"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, Send, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const QUICK_EMOJIS = ["😀", "😂", "😊", "😍", "👍", "🙏", "👏", "🎉", "❤️", "😢", "😮", "✅"];
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** Downscales a photo to at most 1600px on its longest side as JPEG, so uploads stay small on mobile data. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 300 * 1024) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

type ReplyTarget = { id: string; senderName: string; preview: string } | null;

/**
 * Message box. Enter sends, Shift+Enter adds a line. A fresh request id per
 * mount (the page remounts it after each send) means a double submit records
 * one message; the send button disables itself while sending.
 */
export function ChatComposer({ chatId, action, reply, cancelReplyHref, edit, editAction }: {
  chatId: string;
  action: (formData: FormData) => Promise<void>;
  reply: ReplyTarget;
  cancelReplyHref: string;
  edit?: { messageId: string; body: string } | null;
  editAction?: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const editing = !!edit;

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = event.target.files?.[0];
    if (!picked) return setFile(null);
    if (!ACCEPT.split(",").includes(picked.type)) {
      event.target.value = "";
      return setError("Send a photo (JPEG, PNG, or WEBP) or a PDF.");
    }
    const prepared = await compressImage(picked);
    if (prepared.size > MAX_BYTES) {
      event.target.value = "";
      return setError("Files must be 4 MB or smaller.");
    }
    if (prepared !== picked) {
      const transfer = new DataTransfer();
      transfer.items.add(prepared);
      event.target.files = transfer.files;
    }
    setFile(prepared);
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setFile(null);
  }

  function insertEmoji(emoji: string) {
    const area = textRef.current;
    if (!area) return;
    const start = area.selectionStart ?? area.value.length;
    area.value = area.value.slice(0, start) + emoji + area.value.slice(area.selectionEnd ?? start);
    area.focus();
    area.selectionStart = area.selectionEnd = start + emoji.length;
  }

  return (
    <form ref={formRef} action={editing ? editAction : action} className="space-y-2 border-t bg-background p-3" aria-label={editing ? "Edit message" : "Send a message"}>
      <input type="hidden" name="chatId" value={chatId} />
      {editing ? <input type="hidden" name="messageId" value={edit.messageId} /> : <input type="hidden" name="clientRequestId" value={requestId} />}
      {reply && !editing ? (
        <div className="flex items-start justify-between gap-2 rounded-md border-l-4 border-primary bg-muted/50 px-3 py-2 text-sm">
          <input type="hidden" name="replyToId" value={reply.id} />
          <span className="min-w-0"><span className="block text-xs font-medium text-primary">Replying to {reply.senderName}</span><span className="block truncate text-muted-foreground">{reply.preview}</span></span>
          <Link href={cancelReplyHref} className="shrink-0 rounded p-1 hover:bg-muted" aria-label="Cancel reply"><X className="size-4" /></Link>
        </div>
      ) : null}
      {editing ? (
        <div className="flex items-center justify-between gap-2 rounded-md border-l-4 border-amber-500 bg-muted/50 px-3 py-2 text-sm">
          <span className="text-xs font-medium">Editing message</span>
          <Link href={cancelReplyHref} className="rounded p-1 hover:bg-muted" aria-label="Cancel edit"><X className="size-4" /></Link>
        </div>
      ) : null}
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">{file.type.startsWith("image/") ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}<span className="truncate">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span></span>
          <button type="button" onClick={clearFile} className="rounded p-1 hover:bg-muted" aria-label="Remove attachment"><X className="size-4" /></button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      {showEmoji ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Insert emoji">
          {QUICK_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="rounded p-1 text-xl hover:bg-muted" aria-label={`Insert ${emoji}`}>{emoji}</button>)}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => setShowEmoji((open) => !open)} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Emoji" aria-expanded={showEmoji}><Smile className="size-5" /></button>
        {!editing ? (
          <label className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Attach a photo or PDF" title="Attach a photo or PDF">
            <Paperclip className="size-5" />
            <input ref={fileRef} type="file" name="file" accept={ACCEPT} className="sr-only" onChange={onFileChange} />
          </label>
        ) : null}
        <label htmlFor={`composer-${chatId}`} className="sr-only">Message</label>
        <textarea
          id={`composer-${chatId}`}
          ref={textRef}
          name="body"
          rows={1}
          maxLength={4000}
          defaultValue={edit?.body ?? ""}
          placeholder={file ? "Add a caption (optional)" : "Type a message"}
          required={!file}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          onInput={(event) => {
            const area = event.currentTarget;
            area.style.height = "auto";
            area.style.height = `${Math.min(area.scrollHeight, 160)}px`;
          }}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" className="rounded-full" aria-label={editing ? "Save edit" : "Send"} pendingLabel={<span className="sr-only">Sending</span>}><Send /></Button>
      </div>
    </form>
  );
}
