import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";
import { PricingCard } from "../components/PricingCard";
import { pricingPlans } from "../data";

export default function PricingPage() {
  return (
    <MarketingLayout className="max-w-7xl pb-28 pt-8">

      {/* ── HEADER SECTION ── */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        {/* Background: blurred logo watermark */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />

        {/* Floating code strings */}
        <div className="pointer-events-none absolute left-8 top-16 float-code select-none font-mono text-[11px] text-[#1a6dff]/30 leading-6 hidden lg:block">
          <div>{"const plans = RockFrost.pricing();"}</div>
          <div>{"plans.forEach(plan => {"}</div>
          <div>{"  plan.scale(yourBusiness);"}</div>
          <div>{"  plan.support = '24/7';"}</div>
          <div>{"});"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-12 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"suite.billing({ cycle: 'monthly' });"}</div>
          <div>{"suite.onboard({ guided: true });"}</div>
        </div>

        {/* Blue orb glows */}
        <div className="pointer-events-none absolute left-1/3 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.12) 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)" }} />

        {/* Blue rim line at top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Pricing</span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
            Flexible plans for{" "}
            <span className="text-gradient-blue">ambitious teams.</span>
          </h1>
          <p className="max-w-xl text-base leading-8 text-[#6b7f96] sm:text-lg">
            Choose the right level of support and scale with a solution built to grow with your business.
          </p>
          <div className="steel-divider" />
        </div>
      </section>

      {/* ── PRICING CARDS ── */}
      <section className="mt-24 overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-10 sm:p-14"
        style={{ boxShadow: "0 40px 140px -80px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        <div className="steel-divider mb-10" />
        <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Choose your plan</p>
        <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
          Every plan includes secure onboarding and{" "}
          <span className="text-gradient-blue">expert support.</span>
        </h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan, i) => {
            const isFeatured = i === 1;
            return (
              <div key={plan.plan}
                className={`card-glow-hover relative overflow-hidden rounded-[2rem] border p-8 text-left transition ${isFeatured
                  ? "border-[#1a6dff]/50 bg-[#1a6dff]/8"
                  : "border-[#1a6dff]/12 bg-black/60"
                }`}
                style={isFeatured ? { boxShadow: "0 0 50px -15px rgba(26,109,255,0.4), inset 0 1px 0 rgba(255,255,255,0.05)" } : {}}>
                {isFeatured && (
                  <div className="absolute inset-x-0 top-0 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, #1a6dff, #0ea5e9, #1a6dff, transparent)" }} />
                )}
                {isFeatured && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(26,109,255,0.06) 0%, transparent 70%)" }} />
                )}
                <div className="relative">
                  <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">{plan.plan}</p>
                  <h3 className="mt-4 text-2xl font-semibold text-white">
                    {plan.plan === "Enterprise" ? "Flexible pricing" : "Contact Sales"}
                  </h3>
                  <div className="my-5 h-px" style={{ background: "linear-gradient(90deg, rgba(26,109,255,0.2), transparent)" }} />
                  <p className="text-sm leading-7 text-[#6b7f96]">{plan.description}</p>
                  <button
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition ${isFeatured
                      ? "btn-blue text-white"
                      : "border border-[#1a6dff]/25 bg-transparent text-[#b8c5d6] hover:border-[#1a6dff]/50 hover:text-white"
                    }`}>
                    {plan.actionLabel}
                    {isFeatured && (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FEATURES INCLUDED ── */}
      <section className="mt-24 overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-8 sm:p-12"
        style={{ boxShadow: "0 40px 120px -60px rgba(26,109,255,0.2), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        <div className="steel-divider mb-10" />
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">What's included</p>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Everything you need to{" "}
              <span className="text-gradient-blue">hit the ground running.</span>
            </h2>
            <p className="max-w-sm text-sm leading-7 text-[#6b7f96]">
              Every plan comes with the tools, support, and onboarding your team needs from day one.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { title: "Guided onboarding", description: "A dedicated specialist walks your team through setup and configuration." },
              { title: "Priority support", description: "Reach our support team 24/7 via chat, email, and phone." },
              { title: "Secure infrastructure", description: "Enterprise-grade encryption and compliance built into every tier." },
              { title: "Tailored guidance", description: "Ongoing strategic reviews to keep your platform aligned to your growth." },
            ].map((feature) => (
              <div key={feature.title}
                className="card-glow-hover group rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6 transition hover:border-[#1a6dff]/35">
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

      {/* ── CTA ── */}
      <section className="mt-24 relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-black p-10 text-center sm:p-16"
        style={{ boxShadow: "0 0 100px -30px rgba(26,109,255,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '50%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: 0.03, filter: 'blur(4px)' }} />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.1) 0%, transparent 65%)" }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Ready to start</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
            Turning ideas into{" "}
            <span className="text-gradient-blue">infinite possibilities.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Contact our team when you're ready to fast-track adoption with a tailored implementation plan.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white sm:w-auto">
              Contact Sales
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