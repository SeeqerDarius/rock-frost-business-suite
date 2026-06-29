import Link from "next/link";
import { MarketingLayout } from "./components/MarketingLayout";
import { SectionHeader } from "./components/SectionHeader";
import { ModuleCard } from "./components/ModuleCard";
import { coreModules, featureHighlights, industries, pricingPlans } from "./data";

export default function Home() {
  return (
    <MarketingLayout className="max-w-7xl pb-28 pt-8">

      {/* ── HERO ── */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        {/* Background: blurred logo watermark */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />

        {/* Floating code strings — logo glasses reflection motif */}
        <div className="pointer-events-none absolute left-8 top-16 float-code select-none font-mono text-[11px] text-[#1a6dff]/30 leading-6 hidden lg:block">
          <div>{"<div class=\"rockfrost\">"}</div>
          <div>{"  function innovate() {"}</div>
          <div>{"    let ideas = true;"}</div>
          <div>{"    const solutions = ∞;"}</div>
          <div>{"    return possibilities;"}</div>
          <div>{"  }"}</div>
          <div>{"}"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-24 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"const suite = new RockFrost();"}</div>
          <div>{"suite.deploy({ region: 'africa' });"}</div>
          <div>{"suite.scale(Infinity);"}</div>
        </div>

        {/* Blue orb glows */}
        <div className="pointer-events-none absolute left-1/3 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.12) 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)" }} />

        {/* Blue rim line at top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl space-y-8">

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
              <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Rock Frost Technologies</span>
            </div>

            <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
              Premium AI-ready software{" "}
              <span className="text-gradient-blue">for modern African enterprises.</span>
            </h1>

            <p className="max-w-xl text-base leading-8 text-[#6b7f96] sm:text-lg">
              Rock Frost Business Suite brings intelligent operations, payments, teams, and analytics together in one secure, high-performance platform.
            </p>

            <div className="steel-divider" />

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white sm:w-auto">
                Request Demo
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <Link href="/features" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#b8c5d6]/20 bg-transparent px-7 py-3.5 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
                Explore Features
              </Link>
            </div>
          </div>

          {/* Hero stats card */}
          <div className="relative overflow-hidden rounded-[2rem] border border-[#1a6dff]/20 bg-[#040a14] p-8 rim-glow scan-overlay">
            <div className="absolute inset-x-0 top-0 h-24"
              style={{ background: "linear-gradient(180deg, rgba(26,109,255,0.08) 0%, transparent 100%)" }} />

            <div className="relative space-y-5">
              <div className="rounded-2xl border border-[#1a6dff]/10 bg-black/60 p-6">
                <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Trusted by growing teams</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {[
                    { label: "240+", value: "Business users" },
                    { label: "98%", value: "Customer satisfaction" },
                    { label: "12+", value: "Modules in one suite" },
                    { label: "24/7", value: "Support access" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-[#1a6dff]/10 bg-[#1a6dff]/5 p-4">
                      <p className="text-2xl font-semibold text-gradient-blue">{item.label}</p>
                      <p className="mt-1.5 text-xs text-[#6b7f96]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#1a6dff]/25 bg-[#1a6dff]/8 p-6"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 30px -10px rgba(26,109,255,0.3)" }}>
                <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Unified operations</p>
                <h2 className="mt-3 text-xl font-semibold text-white">Every team, every tool, one platform.</h2>
                <p className="mt-3 text-sm leading-7 text-[#6b7f96]">
                  From finance to HR and logistics, Rock Frost Business Suite keeps every part of your organization moving forward.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CORE MODULES ── */}
      <section className="mt-24 space-y-10">
        <SectionHeader
          eyebrow="Core modules"
          title="The essential modules that power your business."
          description="From fleet operations to payments, every module is built for visibility and speed."
        />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {coreModules.map((module) => (
            <ModuleCard key={module.title} title={module.title} description={module.description} />
          ))}
        </div>
      </section>

      {/* ── WHY ROCK FROST ── */}
      <section className="mt-24 overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-8 sm:p-12"
        style={{ boxShadow: "0 40px 120px -60px rgba(26,109,255,0.2), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        <div className="steel-divider mb-10" />
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Why Rock Frost</p>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Built to help African businesses scale{" "}
              <span className="text-gradient-blue">with confidence.</span>
            </h2>
            <p className="max-w-sm text-sm leading-7 text-[#6b7f96]">
              When your operations are smarter and connected, decisions become faster and risks become smaller.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {featureHighlights.map((feature) => (
              <div key={feature.title}
                className="group rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6 transition hover:border-[#1a6dff]/35"
                style={{ boxShadow: "0 0 0 0 rgba(26,109,255,0)" }}>
                <div className="mb-4 h-8 w-8 rounded-lg border border-[#1a6dff]/30 bg-[#1a6dff]/10 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-[#1a6dff]" />
                </div>
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2.5 text-sm leading-7 text-[#6b7f96]">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI ASSISTANT ── */}
      <section className="mt-24 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div className="flex flex-col rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-10"
          style={{ boxShadow: "0 30px 90px -50px rgba(26,109,255,0.2)" }}>
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">AI assistant</p>
          <h2 className="mt-5 text-3xl font-semibold text-white sm:text-4xl">
            An intelligent assistant that{" "}
            <span className="text-gradient-blue">predicts business performance.</span>
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6b7f96]">
            Use AI-driven insights to streamline planning, automate routine tasks, and keep your team focused on growth.
          </p>
          <div className="mt-8 flex-1 space-y-3 rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6">
            {[
              "Automated forecasting for revenue and inventory",
              "Smart reminders for approvals, payroll, and payments",
              "Insights to keep your business efficient and compliant",
            ].map((item, i) => (
              <div key={item} className="flex items-start gap-3.5 text-sm text-[#94a3b8]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 text-[10px] font-semibold text-[#3b8eff]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Assistant preview — code-screen aesthetic */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-black scan-overlay"
          style={{ boxShadow: "0 0 60px -15px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          {/* Screen glow */}
          <div className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(26,109,255,0.08) 0%, transparent 60%)" }} />

          <div className="relative p-8 h-full flex flex-col">
            {/* Terminal header */}
            <div className="flex items-center gap-2 mb-6">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Assistant preview</span>
            </div>

            <div className="flex-1 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-[#1a6dff]/25 bg-[#1a6dff]/15 px-5 py-4">
                  <p className="text-sm text-[#93c5fd]">{"Show me the top five underperforming stores this month."}</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10">
                  <span className="text-[8px] font-bold text-[#3b8eff]">RF</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-white/5 bg-[#040a14] px-5 py-4">
                  <p className="text-sm leading-7 text-[#94a3b8]">
                    Your reporting engine shows the Lagos warehouse needs attention: stock levels are{" "}
                    <span className="text-[#ef4444] font-semibold">32% below target</span>{" "}
                    and sales are slowing in the support region.
                  </p>
                </div>
              </div>

              {/* Data visualization mock */}
              <div className="rounded-2xl border border-[#1a6dff]/12 bg-[#040a14]/80 p-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff] mb-4">Performance overview</p>
                <div className="space-y-3">
                  {[
                    { name: "Lagos Warehouse", pct: 32, color: "#ef4444" },
                    { name: "Accra Hub", pct: 61, color: "#f59e0b" },
                    { name: "Nairobi Branch", pct: 78, color: "#1a6dff" },
                    { name: "Cape Town", pct: 91, color: "#22c55e" },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center gap-3 text-xs">
                      <span className="w-28 shrink-0 text-[#6b7f96]">{row.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                      </div>
                      <span className="w-8 text-right font-mono text-[#b8c5d6]">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INDUSTRIES ── */}
      <section className="mt-24 space-y-10">
        <SectionHeader
          eyebrow="Industries"
          title="Serving businesses across African markets and beyond."
          description="From retail and hospitality to clinics and construction, Rock Frost Business Suite adapts to your industry."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {industries.map((industry) => (
            <div key={industry}
              className="flex items-center gap-3.5 rounded-2xl border border-[#1a6dff]/12 bg-[#040a14] px-6 py-5 text-sm text-[#94a3b8] transition hover:border-[#1a6dff]/30 hover:text-white">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a6dff]" />
              {industry}
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="mt-24 overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-10 text-center sm:p-14"
        style={{ boxShadow: "0 40px 140px -80px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        <div className="steel-divider mb-10" />
        <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Pricing preview</p>
        <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
          Choose a plan that fits your{" "}
          <span className="text-gradient-blue">growth stage.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
          Every plan includes secure onboarding, expert support, and tailored guidance for your business.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan, i) => {
            const isFeatured = i === 1;
            return (
              <div key={plan.plan}
                className={`relative overflow-hidden rounded-[2rem] border p-8 text-left transition ${isFeatured
                  ? "border-[#1a6dff]/50 bg-[#1a6dff]/8"
                  : "border-[#1a6dff]/12 bg-black/60"
                }`}
                style={isFeatured ? { boxShadow: "0 0 50px -15px rgba(26,109,255,0.4), inset 0 1px 0 rgba(255,255,255,0.05)" } : {}}>
                {isFeatured && (
                  <div className="absolute inset-x-0 top-0 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, #1a6dff, #0ea5e9, #1a6dff, transparent)" }} />
                )}
                <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">{plan.plan}</p>
                <h3 className="mt-4 text-2xl font-semibold text-white">
                  {plan.plan === "Enterprise" ? "Flexible pricing" : "Contact Sales"}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#6b7f96]">{plan.description}</p>
                <button
                  className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${isFeatured
                    ? "btn-blue text-white"
                    : "border border-[#1a6dff]/25 bg-transparent text-[#b8c5d6] hover:border-[#1a6dff]/50 hover:text-white"
                  }`}>
                  {plan.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mt-24 relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-black p-10 text-center sm:p-16"
        style={{ boxShadow: "0 0 100px -30px rgba(26,109,255,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        {/* Background: blurred logo */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '50%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: 0.03, filter: 'blur(4px)' }} />

        {/* Center glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.1) 0%, transparent 65%)" }} />

        {/* Top rim */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Ready to start</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
            Turning ideas into{" "}
            <span className="text-gradient-blue">infinite possibilities.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Join African leaders using Rock Frost Business Suite to manage growth, improve efficiency, and deliver better customer outcomes.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white sm:w-auto">
              Request Demo
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link href="/features" className="inline-flex w-full items-center justify-center rounded-full border border-[#b8c5d6]/20 bg-transparent px-8 py-4 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
              Explore Modules
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}