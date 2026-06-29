import Link from "next/link";
import { Navbar } from "../components/Navbar";
import { SectionHeader } from "../components/SectionHeader";
import { FeatureCard } from "../components/FeatureCard";
import { Footer } from "../components/Footer";
import { featureHighlights } from "../data";

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_18%),linear-gradient(180deg,_#020617_0%,_#070b12_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
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
        <div className="mt-16 rounded-[3rem] border border-white/10 bg-white/5 p-10 text-center shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <h2 className="text-3xl font-semibold text-white">See the platform in action.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Request a demo to learn how Rock Frost Business Suite brings your teams, systems, and customers together.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="rounded-full bg-cyan-500/15 px-7 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25">
              Request Demo
            </Link>
            <Link href="/pricing" className="rounded-full border border-white/10 bg-white/10 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
              View Pricing
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
