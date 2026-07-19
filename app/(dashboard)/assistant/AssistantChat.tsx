"use client";

import { useState } from "react";

export function AssistantChat() {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setReply(null);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setReply(data.reply);
      }
    } catch {
      setError("Could not reach the assistant.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
        <label className="block text-sm text-slate-300">
          <span className="mb-3 inline-block text-xs uppercase tracking-[0.24em] text-cyan-200/70">Ask a question</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            required
            placeholder="e.g. What should I check before a vehicle's roadworthy certificate expires?"
            className="w-full rounded-2xl border border-[#1a6dff]/15 bg-[#040a14] px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn-blue mt-4 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {reply ? (
        <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Assistant</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{reply}</p>
        </div>
      ) : null}
    </div>
  );
}
