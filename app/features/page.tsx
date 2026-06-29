import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";
import { FeatureCard } from "../components/FeatureCard";

const features = [
  {
    title: "Intelligent operations",
    description:
      "Centralize approvals, workflows, and team collaboration across every department.",
  },
  {
    title: "Payments and reconciliation",
    description:
      "Collect payments securely, reconcile transactions, and close the books faster.",
  },
  {
    title: "Customer relationship management",
    description:
      "Keep customer data, conversations, and opportunities aligned across your business.",
  },
  {
    title: "Deep performance analytics",
    description:
      "Use dashboards to identify growth opportunities, reduce risk, and optimize operations.",
  },
  {
    title: "Mobile-ready access",
    description:
      "Teams can manage work and approvals from any device while staying secure.",
  },
  {
    title: "AI-driven guidance",
    description:
      "Improve planning and execution with predictive intelligence built into the platform.",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingLayout>
      <SectionHeader
        eyebrow="Features"
        title="Modern capabilities for every business challenge."
        description="A suite of intelligent tools that help teams run operations, deliver value, and stay aligned."
      />

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {features.map((feature) => (
          <FeatureCard key={feature.title} title={feature.title} description={feature.description} />
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
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">See it live</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            See the platform{" "}
            <span className="text-gradient-blue">in action.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Request a demo to learn how Rock Frost Business Suite brings your teams, systems, and customers together.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white sm:w-auto">
              Request Demo
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link href="/pricing" className="inline-flex w-full items-center justify-center rounded-full border border-[#b8c5d6]/20 bg-transparent px-7 py-3 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
              View Pricing
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}