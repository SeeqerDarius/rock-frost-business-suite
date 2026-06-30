import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";
import { industries } from "../data";

export default function IndustriesPage() {
  return (
    <MarketingLayout className="max-w-7xl pb-28 pt-8">

      {/* ── HEADER SECTION ── */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />

        <div className="pointer-events-none absolute left-8 top-16 float-code select-none font-mono text-[11px] text-[#1a6dff]/30 leading-6 hidden lg:block">
          <div>{"const industries = suite.markets();"}</div>
          <div>{"industries.forEach(sector => {"}</div>
          <div>{"  sector.adapt(localContext);"}</div>
          <div>{"});"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-12 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"suite.expertise.region = 'africa';"}</div>
          <div>{"suite.scale.verticals(true);"}</div>
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
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Industries</span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
            A platform designed for{" "}
            <span className="text-gradient-blue">diverse business environments.</span>
          </h1>
          <p className="max-w-xl text-base leading-8 text-[#6b7f96] sm:text-lg">
            Rock Frost Business Suite fits the needs of transport, retail, schools, clinics, and more.
          </p>
          <div className="steel-divider" />
        </div>
      </section>

      {/* ── INDUSTRY GRID — original sm:grid-cols-2 xl:grid-cols-3 layout preserved ── */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {industries.map((industry) => (
          <div key={industry}
            className="card-glow-hover flex items-center gap-3.5 rounded-2xl border border-[#1a6dff]/12 bg-[#040a14] px-6 py-6 text-sm leading-6 text-[#94a3b8] transition hover:border-[#1a6dff]/30 hover:text-white">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a6dff]" />
            {industry}
          </div>
        ))}
      </div>

      {/* ── CTA — matches homepage exactly ── */}
      <section className="mt-16 relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-black p-10 text-center sm:p-16"
        style={{ boxShadow: "0 0 100px -30px rgba(26,109,255,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '50%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: 0.03, filter: 'blur(4px)' }} />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.1) 0%, transparent 65%)" }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Local expertise</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            Partner with a platform that{" "}
            <span className="text-gradient-blue">understands your industry.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Our solutions support your growth through specialized tools and local market expertise.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white sm:w-auto">
              Request Demo
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link href="/features" className="inline-flex w-full items-center justify-center rounded-full border border-[#b8c5d6]/20 bg-transparent px-8 py-4 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
              Explore Features
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}