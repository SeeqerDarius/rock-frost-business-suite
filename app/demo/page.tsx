"use client";

import { useState } from "react";
import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";

const moduleOptions = ["Fleet", "CRM", "Inventory", "POS", "Accounting", "HR", "Payroll", "AI Assistant", "Custom Software"];

export default function DemoPage() {
  const [formState, setFormState] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    position: "",
    email: "",
    phone: "",
    country: "",
    employeeCount: "",
    industry: "",
    modulesInterestedIn: "",
    demoDate: "",
    demoTime: "",
    notes: "",
  });

  function updateField(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFormState("idle");
    setMessage("");

    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      setFormState("error");
      setMessage(data.message || "Unable to submit your request right now.");
    } else {
      setFormState("success");
      setMessage(data.message || "Demo request received.");
      setFormData({
        name: "",
        company: "",
        position: "",
        email: "",
        phone: "",
        country: "",
        employeeCount: "",
        industry: "",
        modulesInterestedIn: "",
        demoDate: "",
        demoTime: "",
        notes: "",
      });
    }

    setLoading(false);
  }

  if (formState === "success") {
    return (
      <MarketingLayout className="max-w-6xl pb-28 pt-8">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
          style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '50%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: 0.03, filter: 'blur(4px)' }} />
          <div className="relative mx-auto max-w-2xl text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Demo request confirmed</p>
            <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Thank you for requesting a demo.</h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#6b7f96] sm:text-base">
              A Rock Frost specialist will reach out shortly to confirm your preferred date, time, and the modules most relevant to your business.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/contact" className="btn-blue inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold text-white">Contact our team</Link>
              <Link href="/" className="rounded-full border border-[#b8c5d6]/20 px-7 py-3 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white">Return home</Link>
            </div>
          </div>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout className="max-w-7xl pb-28 pt-8">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />
        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Request demo</span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
            See Rock Frost Business Suite in action with a tailored demo.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-[#6b7f96] sm:text-lg">
            Share your priorities and we’ll arrange a guided walkthrough for your team.
          </p>
          <div className="steel-divider" />
        </div>
      </section>

      <section className="mt-12 rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#040a14] p-8 scan-overlay sm:p-10"
        style={{ boxShadow: "0 0 60px -15px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Name</span>
              <input name="name" value={formData.name} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Company</span>
              <input name="company" value={formData.company} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Position</span>
              <input name="position" value={formData.position} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Email</span>
              <input type="email" name="email" value={formData.email} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Phone</span>
              <input type="tel" name="phone" value={formData.phone} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Country</span>
              <input name="country" value={formData.country} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Number of employees</span>
              <input name="employeeCount" value={formData.employeeCount} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Industry</span>
              <input name="industry" value={formData.industry} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/15 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
          </div>
          <label className="space-y-3 text-sm text-[#94a3b8]">
            <span>Modules interested in</span>
            <select name="modulesInterestedIn" value={formData.modulesInterestedIn} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required>
              <option value="">Select a module</option>
              {moduleOptions.map((module) => <option key={module} value={module}>{module}</option>)}
            </select>
          </label>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Preferred demo date</span>
              <input type="date" name="demoDate" value={formData.demoDate} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Preferred demo time</span>
              <input type="time" name="demoTime" value={formData.demoTime} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required />
            </label>
          </div>
          <label className="space-y-3 text-sm text-[#94a3b8]">
            <span>Additional notes</span>
            <textarea name="notes" value={formData.notes} onChange={updateField} rows={5} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" />
          </label>
          {message ? <p className="text-sm text-[#3b8eff]">{message}</p> : null}
          <button type="submit" disabled={loading} className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white">
            {loading ? "Submitting..." : "Request demo"}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </button>
        </form>
      </section>
    </MarketingLayout>
  );
}
