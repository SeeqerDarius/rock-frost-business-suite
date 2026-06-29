import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";
import { industries } from "../data";

export default function IndustriesPage() {
  return (
    <MarketingLayout>
        <SectionHeader
          eyebrow="Industries"
          title="A platform designed for diverse business environments."
          description="Rock Frost Business Suite fits the needs of transport, retail, schools, clinics, and more."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {industries.map((industry) => (
            <div key={industry} className="rounded-3xl glass-card px-6 py-6 text-sm leading-6 text-zinc-200 shadow-sm">
              {industry}
            </div>
          ))}
        </div>
        <div className="mt-16 rounded-[3rem] glass-card scan-overlay p-10 text-center shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <h2 className="text-3xl font-semibold text-white">Partner with a platform that understands your industry.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Our solutions support your growth through specialized tools and local market expertise.
          </p>
        </div>
    </MarketingLayout>
  );
}
