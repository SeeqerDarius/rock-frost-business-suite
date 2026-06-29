import { Navbar } from "../components/Navbar";
import { SectionHeader } from "../components/SectionHeader";
import { Footer } from "../components/Footer";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_18%),linear-gradient(180deg,_#020617_0%,_#070b12_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionHeader
          eyebrow="About"
          title="Rock Frost Technologies builds modern SaaS for African enterprises."
          description="We bring intelligent software, secure infrastructure, and premium business support to teams across the continent."
        />
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <div className="space-y-6 rounded-[3rem] border border-white/10 bg-white/5 p-10 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Our mission</p>
            <p className="text-sm leading-7 text-zinc-300">
              Rock Frost Technologies empowers African businesses with intelligent software that consolidates operations, enhances visibility, and supports long-term growth.
            </p>
          </div>
          <div className="space-y-6 rounded-[3rem] border border-white/10 bg-white/5 p-10 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Our approach</p>
            <p className="text-sm leading-7 text-zinc-300">
              We combine premium design, local market insights, and modern cloud technology to deliver a reliable platform for ambitious teams.
            </p>
          </div>
        </div>
        <div className="mt-16 rounded-[3rem] border border-white/10 bg-slate-950/70 p-10 shadow-[0_30px_90px_-70px_rgba(56,189,248,0.18)]">
          <h2 className="text-2xl font-semibold text-white">Trusted for growth, built for resilience.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
            We design with African business realities in mind, delivering tools that help teams adapt to fast-moving markets, manage complexity, and build trust with their customers.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
