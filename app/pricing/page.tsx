import { Navbar } from "../components/Navbar";
import { SectionHeader } from "../components/SectionHeader";
import { PricingCard } from "../components/PricingCard";
import { Footer } from "../components/Footer";
import { pricingPlans } from "../data";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_18%),linear-gradient(180deg,_#020617_0%,_#070b12_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
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
        <div className="mt-16 rounded-[3rem] border border-white/10 bg-white/5 p-10 text-center shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <h2 className="text-3xl font-semibold text-white">Ready to align teams, finance, and growth.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Contact our team when you’re ready to fast-track adoption with a tailored implementation plan.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
