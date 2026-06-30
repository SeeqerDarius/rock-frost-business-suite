"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("idle");
    setMessage("");

    const response = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setStatus("error");
      setMessage(data.message || "Unable to subscribe right now.");
    } else {
      setStatus("success");
      setMessage(data.message || "Subscribed successfully.");
      setEmail("");
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm text-[#94a3b8]">
        <span className="mb-2 inline-block text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Newsletter</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
          placeholder="Enter your email"
          required
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="btn-blue inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white"
      >
        {loading ? "Subscribing..." : "Subscribe"}
      </button>
      {message ? (
        <p className={`text-sm ${status === "success" ? "text-[#3b8eff]" : "text-[#ef4444]"}`}>{message}</p>
      ) : null}
    </form>
  );
}
