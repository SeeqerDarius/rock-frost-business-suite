import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";
import { PricingCard } from "../components/PricingCard";
import { pricingPlans } from "../data";

export default function PricingPage() {
  return (
    <MarketingLayout>
      <SectionHeader
        eyebrow="Pricing"
        title="Flexible plans for ambitious teams."
        description="Choose the right level of support and scale with a solution built to grow with your business."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {pricingPlans.map((plan) => (
          <PricingCard key={plan.plan} {...plan} />
        ))}
      </div>

      <div className="mt-16 relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#040a14] p-10 text-center scan-overlay"
        style={{ boxShadow: "0 0 80px -25px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        {/* Top rim */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />
        {/* Center glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.07) 0%, transparent 65%)" }} />

        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Let's talk</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            Ready to align teams, finance, and{" "}
            <span className="text-gradient-blue">growth.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Contact our team when you're ready to fast-track adoption with a tailored implementation plan.
          </p>
        </div>
      </div>
    </MarketingLayout>
  );
}