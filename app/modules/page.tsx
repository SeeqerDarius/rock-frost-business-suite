import Link from "next/link";
import { Navbar } from "../components/Navbar";
import { SectionHeader } from "../components/SectionHeader";
import { ModuleCard } from "../components/ModuleCard";
import { Footer } from "../components/Footer";
import { coreModules } from "../data";

export default function ModulesPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_18%),linear-gradient(180deg,_#020617_0%,_#070b12_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
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
        <div className="mt-16 rounded-[3rem] border border-white/10 bg-white/5 p-10 text-center shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <h2 className="text-3xl font-semibold text-white">Everything your teams need to move faster.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            From fleet and inventory to payroll and analytics, Rock Frost Business Suite keeps your operations connected.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/pricing" className="rounded-full bg-cyan-500/15 px-7 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25">
              Request Demo
            </Link>
            <Link href="/contact" className="rounded-full border border-white/10 bg-white/10 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
              Contact Sales
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
