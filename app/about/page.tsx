import { MarketingLayout } from "../components/MarketingLayout";
import { SectionHeader } from "../components/SectionHeader";

export default function AboutPage() {
  return (
    <MarketingLayout className="max-w-6xl">
      <SectionHeader
        eyebrow="About"
        title="Rock Frost Technologies builds the future of intelligent enterprise software."
        description="We deliver premium SaaS solutions that help African businesses operate with speed, security, and clarity."
      />
      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <div className="space-y-6 rounded-[3rem] glass-card p-10 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Our mission</p>
          <p className="text-sm leading-7 text-zinc-300">
            Rock Frost Technologies empowers African businesses with intelligent software that consolidates operations, enhances visibility, and supports long-term growth.
          </p>
        </div>
        <div className="space-y-6 rounded-[3rem] glass-card p-10 shadow-[0_30px_90px_-70px_rgba(255,255,255,0.15)]">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Our approach</p>
          <p className="text-sm leading-7 text-zinc-300">
            We combine premium design, local market insights, and modern cloud technology to deliver a reliable platform for ambitious teams.
          </p>
        </div>
      </div>
      <div className="mt-16 rounded-[3rem] glass-card scan-overlay p-10 shadow-[0_30px_90px_-70px_rgba(56,189,248,0.18)]">
        <h2 className="text-2xl font-semibold text-white">Trusted for growth, built for resilience.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
          We design with African business realities in mind, delivering tools that help teams adapt to fast-moving markets, manage complexity, and build trust with their customers.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-cyan-400/10 bg-slate-900/80 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Contact</p>
            <p className="mt-3 text-sm text-zinc-300">+233540658389</p>
            <p className="text-sm text-zinc-300">rocfrostconsult@gmail.com</p>
          </div>
          <div className="rounded-3xl border border-cyan-400/10 bg-slate-900/80 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Future email</p>
            <p className="mt-3 text-sm text-zinc-300">info@rockfrostgroup.com</p>
            <p className="mt-3 text-xs text-zinc-500">Coming soon.</p>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
