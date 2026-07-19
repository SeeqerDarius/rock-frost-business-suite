"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkNotificationReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="shrink-0 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
    >
      {pending ? "Marking..." : "Mark as read"}
    </button>
  );
}
