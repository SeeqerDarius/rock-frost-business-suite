import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";

export default function ContactPage() {
  return (
    <MarketingLayout className="max-w-5xl">
      <SectionHeader
        eyebrow="Contact"
        title="Start the conversation with Rock Frost Technologies."
        description="Share your business goals and we’ll help you explore the best path to intelligent enterprise operations and growth."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 rounded-[3rem] glass-card p-8 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)] sm:p-10">
          <h2 className="text-3xl font-semibold text-white">Talk to our expert team</h2>
          <p className="max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Our team is ready to help you evaluate Rock Frost Business Suite for your business, implementation, training, and support.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Call</p>
              <p className="mt-4 text-sm leading-7 text-zinc-200">+233540658389</p>
              <p className="text-sm leading-7 text-zinc-200">+23350764590</p>
              <p className="text-sm leading-7 text-zinc-200">+233598775671</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">WhatsApp</p>
              <p className="mt-4 text-sm leading-7 text-zinc-200">+233554671026</p>
              <p className="mt-4 text-xs leading-6 text-zinc-500">Prefer email? Reach us at <span className="text-white">rocfrostconsult@gmail.com</span>.</p>
              <p className="mt-2 text-xs leading-6 text-zinc-500">Official email <span className="text-white">info@rockfrostgroup.com</span> is coming soon.</p>
            </div>
          </div>
        </div>

        <form className="space-y-6 rounded-[3rem] glass-card p-8 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)] sm:p-10">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="space-y-3 text-sm text-zinc-200">
              <span>Full name</span>
              <input
                type="text"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
                placeholder="Amina Ade"
              />
            </label>
            <label className="space-y-3 text-sm text-zinc-200">
              <span>Business name</span>
              <input
                type="text"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
                placeholder="Frost Logistics"
              />
            </label>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="space-y-3 text-sm text-zinc-200">
              <span>Email</span>
              <input
                type="email"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
                placeholder="amina@frosttech.co"
              />
            </label>
            <label className="space-y-3 text-sm text-zinc-200">
              <span>Phone number</span>
              <input
                type="tel"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
                placeholder="+233 540 658 389"
              />
            </label>
          </div>

          <label className="space-y-3 text-sm text-zinc-200">
            <span>Message</span>
            <textarea
              rows={5}
              className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
              placeholder="Tell us about your priorities and the outcomes you want to achieve."
            />
          </label>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white btn-blue"
          >
            Submit inquiry
          </button>
          <p className="text-center text-xs text-zinc-500">
            Need support beyond the form? Email <a href="mailto:rocfrostconsult@gmail.com" className="text-white underline decoration-cyan-400/50">rocfrostconsult@gmail.com</a> or WhatsApp <span className="text-white">+233554671026</span>.
          </p>
        </form>
      </div>
    </MarketingLayout>
  );
}
