import { Navbar } from "../components/Navbar";
import { SectionHeader } from "../components/SectionHeader";
import { Footer } from "../components/Footer";
import { industries } from "../data";

export default function IndustriesPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_18%),linear-gradient(180deg,_#020617_0%,_#070b12_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionHeader
          eyebrow="Industries"
          title="A platform designed for diverse business environments."
          description="Rock Frost Business Suite fits the needs of transport, retail, schools, clinics, and more."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {industries.map((industry) => (
            <div key={industry} className="rounded-3xl border border-white/10 bg-white/5 px-6 py-6 text-sm leading-6 text-zinc-200 shadow-sm">
              {industry}
            </div>
          ))}
        </div>
        <div className="mt-16 rounded-[3rem] border border-white/10 bg-white/5 p-10 text-center shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <h2 className="text-3xl font-semibold text-white">Partner with a platform that understands your industry.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Our solutions support your growth through specialized tools and local market expertise.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
