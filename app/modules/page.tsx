import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";
import { ModuleCard } from "../components/ModuleCard";
import { coreModules } from "../data";

export default function ModulesPage() {
  return (
    <MarketingLayout>
      <SectionHeader
        eyebrow="Modules"
        title="All the modules your business needs in one unified platform."
        description="Operate with clarity, manage assets, and give your teams modern tools built for growth."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {coreModules.map((module) => (
          <ModuleCard key={module.title} title={module.title} description={module.description} />
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
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">Get started</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            Everything your teams need{" "}
            <span className="text-gradient-blue">to move faster.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            From fleet and inventory to payroll and analytics, Rock Frost Business Suite keeps your operations connected.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/pricing" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white sm:w-auto">
              Request Demo
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link href="/contact" className="inline-flex w-full items-center justify-center rounded-full border border-[#b8c5d6]/20 bg-transparent px-7 py-3 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
              Contact Sales
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}