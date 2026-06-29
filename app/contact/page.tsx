import { Navbar } from "../components/Navbar";
import { SectionHeader } from "../components/SectionHeader";
import { Footer } from "../components/Footer";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_18%),linear-gradient(180deg,_#020617_0%,_#070b12_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionHeader
          eyebrow="Contact"
          title="Start the conversation with our team."
          description="Share your business goals and we’ll help you explore the best way to move forward with Rock Frost Business Suite."
        />
        <form className="mt-12 space-y-6 rounded-[3rem] border border-white/10 bg-white/5 p-8 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)] sm:p-10">
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
                placeholder="+234 808 123 4567"
              />
            </label>
          </div>
          <label className="space-y-3 text-sm text-zinc-200">
            <span>Business type</span>
            <input
              type="text"
              className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
              placeholder="Retail, Logistics, Hospitality"
            />
          </label>
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
            className="inline-flex w-full items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-cyan-400/90"
          >
            Submit inquiry
          </button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
