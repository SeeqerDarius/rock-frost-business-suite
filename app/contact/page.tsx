"use client";

import { useState } from "react";
import { MarketingLayout } from "../components/MarketingLayout";

const initialForm = {
  fullName: "",
  company: "",
  email: "",
  phone: "",
  businessType: "",
  employeeCount: "",
  servicesInterestedIn: "",
  message: "",
};

export default function ContactPage() {
  const [formData, setFormData] = useState(initialForm);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("idle");
    setMessage("");

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      setStatus("error");
      setMessage(data.message || "Unable to submit your inquiry right now.");
    } else {
      setStatus("success");
      setMessage(data.message || "Thanks for reaching out.");
      setFormData(initialForm);
    }

    setLoading(false);
  }

  return (
    <MarketingLayout className="max-w-7xl pb-28 pt-8">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />
        <div className="pointer-events-none absolute left-8 top-16 float-code select-none font-mono text-[11px] text-[#1a6dff]/30 leading-6 hidden lg:block">
          <div>{"const inquiry = new Contact();"}</div>
          <div>{"inquiry.team = 'Rock Frost';"}</div>
          <div>{"inquiry.respond({ within: '24h' });"}</div>
          <div>{"inquiry.send();"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-12 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"suite.support.channels(['call','whatsapp']);"}</div>
          <div>{"suite.onboard(yourBusiness);"}</div>
        </div>
        <div className="pointer-events-none absolute left-1/3 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.12) 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />
        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Contact</span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
            Start the conversation with{" "}
            <span className="text-gradient-blue">Rock Frost Technologies.</span>
          </h1>
          <p className="max-w-xl text-base leading-8 text-[#6b7f96] sm:text-lg">
            Share your business goals and we'll help you explore the best path to intelligent enterprise operations and growth.
          </p>
          <div className="steel-divider" />
        </div>
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card-glow-hover space-y-6 rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-8 sm:p-10"
          style={{ boxShadow: "0 40px 120px -60px rgba(26,109,255,0.2), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Get in touch</p>
          <h2 className="text-3xl font-semibold text-white">Talk to our expert team</h2>
          <p className="max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Our team is ready to help you evaluate Rock Frost Business Suite for your business, implementation, training, and support.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Call</p>
              <p className="mt-4 text-sm leading-7 text-[#94a3b8]">+233540658389</p>
              <p className="text-sm leading-7 text-[#94a3b8]">+23350764590</p>
              <p className="text-sm leading-7 text-[#94a3b8]">+233598775671</p>
            </div>
            <div className="rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">WhatsApp</p>
              <p className="mt-4 text-sm leading-7 text-[#94a3b8]">+233554671026</p>
              <p className="mt-4 text-xs leading-6 text-[#6b7f96]">Prefer email? Reach us at <span className="text-white">rocfrostconsult@gmail.com</span>.</p>
              <p className="mt-2 text-xs leading-6 text-[#6b7f96]">Official email <span className="text-white">info@rockfrostgroup.com</span> is coming soon.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card-glow-hover space-y-6 rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#040a14] p-8 scan-overlay sm:p-10"
          style={{ boxShadow: "0 0 60px -15px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Full name</span>
              <input name="fullName" value={formData.fullName} onChange={updateField} type="text" className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="Amina Ade" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Company</span>
              <input name="company" value={formData.company} onChange={updateField} type="text" className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="Frost Logistics" required />
            </label>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Email</span>
              <input name="email" value={formData.email} onChange={updateField} type="email" className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="amina@frosttech.co" required />
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Phone</span>
              <input name="phone" value={formData.phone} onChange={updateField} type="tel" className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="+233 540 658 389" required />
            </label>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Business type</span>
              <select name="businessType" value={formData.businessType} onChange={updateField} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" required>
                <option value="">Select type</option>
                <option value="SME">SME</option>
                <option value="Enterprise">Enterprise</option>
                <option value="Startup">Startup</option>
                <option value="Non-profit">Non-profit</option>
              </select>
            </label>
            <label className="space-y-3 text-sm text-[#94a3b8]">
              <span>Number of employees</span>
              <input name="employeeCount" value={formData.employeeCount} onChange={updateField} type="text" className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="10-50" required />
            </label>
          </div>

          <label className="space-y-3 text-sm text-[#94a3b8]">
            <span>Services interested in</span>
            <input name="servicesInterestedIn" value={formData.servicesInterestedIn} onChange={updateField} type="text" className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="Fleet, CRM, Payroll" required />
          </label>

          <label className="space-y-3 text-sm text-[#94a3b8]">
            <span>Message</span>
            <textarea name="message" value={formData.message} onChange={updateField} rows={5} className="w-full rounded-2xl border border-[#1a6dff]/15 bg-black/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15" placeholder="Tell us about your priorities and the outcomes you want to achieve." required />
          </label>
          {message ? <p className={`text-sm ${status === "success" ? "text-[#3b8eff]" : "text-[#ef4444]"}`}>{message}</p> : null}
          <button type="submit" disabled={loading} className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white">
            {loading ? "Submitting..." : "Submit inquiry"}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </button>
          <p className="text-center text-xs text-[#6b7f96]">
            Need support beyond the form? Email <a href="mailto:rocfrostconsult@gmail.com" className="text-white underline decoration-[#1a6dff]/50">rocfrostconsult@gmail.com</a> or WhatsApp <span className="text-white">+233554671026</span>.
          </p>
        </form>
      </div>
    </MarketingLayout>
  );
}