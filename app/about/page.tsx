import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";

export default function AboutPage() {
  return (
    <MarketingLayout className="max-w-7xl pb-28 pt-8">

      {/* ── HEADER SECTION ── */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />

        <div className="pointer-events-none absolute left-8 top-16 float-code select-none font-mono text-[11px] text-[#1a6dff]/30 leading-6 hidden lg:block">
          <div>{"class RockFrost extends Mission {"}</div>
          <div>{"  constructor() {"}</div>
          <div>{"    this.focus = 'africa';"}</div>
          <div>{"    this.build('trust');"}</div>
          <div>{"  }"}</div>
          <div>{"}"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-12 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"team.design.premium = true;"}</div>
          <div>{"team.ship({ resilient: true });"}</div>
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
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">About</span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
            Rock Frost Technologies builds the future of{" "}
            <span className="text-gradient-blue">intelligent enterprise software.</span>
          </h1>
          <p className="max-w-xl text-base leading-8 text-[#6b7f96] sm:text-lg">
            We deliver premium SaaS solutions that help African businesses operate with speed, security, and clarity.
          </p>
          <div className="steel-divider" />
        </div>
      </section>

      {/* ── MISSION + APPROACH — original lg:grid-cols-2 layout preserved ── */}
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="card-glow-hover space-y-6 rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-10"
          style={{ boxShadow: "0 40px 120px -60px rgba(26,109,255,0.2), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Our mission</p>
          <p className="text-sm leading-7 text-[#94a3b8]">
            Rock Frost Technologies empowers African businesses with intelligent software that consolidates operations, enhances visibility, and supports long-term growth.
          </p>
        </div>
        <div className="card-glow-hover space-y-6 rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-10"
          style={{ boxShadow: "0 40px 120px -60px rgba(26,109,255,0.2), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Our approach</p>
          <p className="text-sm leading-7 text-[#94a3b8]">
            We combine premium design, local market insights, and modern cloud technology to deliver a reliable platform for ambitious teams.
          </p>
        </div>
      </div>

      {/* ── TRUST + CONTACT GRID — original layout preserved ── */}
        <div className="card-glow-hover mt-8 rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#040a14] p-10 scan-overlay"
        style={{ boxShadow: "0 0 60px -15px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        <h2 className="text-2xl font-semibold text-white">
          Trusted for growth,{" "}
          <span className="text-gradient-blue">built for resilience.</span>
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6b7f96] sm:text-base">
          We design with African business realities in mind, delivering tools that help teams adapt to fast-moving markets, manage complexity, and build trust with their customers.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="card-glow-hover rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Contact</p>
            <p className="mt-3 text-sm text-[#94a3b8]">+233540658389</p>
            <p className="text-sm text-[#94a3b8]">rocfrostconsult@gmail.com</p>
          </div>
          <div className="card-glow-hover rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Future email</p>
            <p className="mt-3 text-sm text-[#94a3b8]">info@rockfrostgroup.com</p>
            <p className="mt-3 text-xs text-[#6b7f96]">Coming soon.</p>
          </div>
        </div>
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
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Work with us</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            Let's build something{" "}
            <span className="text-gradient-blue">that lasts.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Join African leaders using Rock Frost Business Suite to manage growth, improve efficiency, and deliver better customer outcomes.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white sm:w-auto">
              Request Demo
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link href="/modules" className="inline-flex w-full items-center justify-center rounded-full border border-[#b8c5d6]/20 bg-transparent px-8 py-4 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
              Explore Modules
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}