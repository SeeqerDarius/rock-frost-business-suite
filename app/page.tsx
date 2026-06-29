import Link from "next/link";
import { Button } from "./components/Button";
import { Footer } from "./components/Footer";
import { ModuleCard } from "./components/ModuleCard";
import { Navbar } from "./components/Navbar";
import { SectionHeader } from "./components/SectionHeader";
import { coreModules, featureHighlights, industries, pricingPlans } from "./data";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_22%),linear-gradient(180deg,_#020617_0%,_#090d14_45%,_#06070f_100%)] text-white">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-8 sm:px-8 lg:px-10">
        <section className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-slate-950/70 px-6 py-14 shadow-[0_30px_90px_-50px_rgba(255,255,255,0.15)] sm:px-10 lg:px-16">
          <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle,_rgba(56,189,248,0.18),transparent_60%)] blur-3xl" />
          <div className="relative grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="max-w-2xl space-y-8">
              <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm uppercase tracking-[0.3em] text-cyan-100">
                Premium cloud business platform
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                Run Your Entire Business From One Intelligent Platform.
              </h1>
              <p className="max-w-xl text-base leading-8 text-zinc-300 sm:text-lg">
                Rock Frost Business Suite helps businesses manage operations, teams, payments, assets, reports, and customers from one powerful cloud platform.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link href="/contact" className="w-full sm:w-auto">
                  <Button className="w-full">Request Demo</Button>
                </Link>
                <Link href="/features" className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full">
                    Explore Features
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-[0_30px_80px_-60px_rgba(56,189,248,0.25)]">
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="relative grid gap-4">
                <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
                  <p className="text-sm uppercase tracking-[0.28em] text-cyan-200/80">Trusted by growing teams</p>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    {[
                      { label: "240+", value: "Business users" },
                      { label: "98%", value: "Customer satisfaction" },
                      { label: "12+", value: "Modules in one suite" },
                      { label: "24/7", value: "Support access" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-3xl bg-white/5 p-4">
                        <p className="text-2xl font-semibold text-white">{item.label}</p>
                        <p className="mt-2 text-sm text-zinc-300">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[2rem] border border-cyan-400/10 bg-cyan-500/10 p-6 shadow-[0_20px_60px_-40px_rgba(56,189,248,0.45)]">
                  <p className="text-sm uppercase tracking-[0.28em] text-cyan-100/90">Unified operations</p>
                  <h2 className="mt-4 text-2xl font-semibold text-white">Every team, every tool, one platform.</h2>
                  <p className="mt-4 text-sm leading-7 text-zinc-300">
                    From finance to HR and logistics, Rock Frost Business Suite keeps every part of your organization moving forward.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-20 space-y-10">
          <SectionHeader
            eyebrow="Core modules"
            title="The essential modules that power your business."
            description="From fleet operations to payments, every module is built for visibility and speed."
          />
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {coreModules.map((module) => (
              <ModuleCard key={module.title} title={module.title} description={module.description} />
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-[3rem] border border-white/10 bg-white/5 p-8 shadow-[0_40px_120px_-90px_rgba(255,255,255,0.15)] sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div className="space-y-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Why Rock Frost</p>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Built to help African businesses scale with confidence.
              </h2>
              <p className="max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
                When your operations are smarter and connected, decisions become faster and risks become smaller.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {featureHighlights.map((feature) => (
                <div key={feature.title} className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
                  <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-20 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="rounded-[3rem] border border-white/10 bg-slate-950/70 p-10 shadow-[0_30px_90px_-70px_rgba(56,189,248,0.22)]">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">AI assistant</p>
            <h2 className="mt-6 text-3xl font-semibold text-white sm:text-4xl">
              An intelligent assistant that helps you manage and predict business performance.
            </h2>
            <p className="mt-5 text-sm leading-7 text-zinc-300 sm:text-base">
              Use AI-driven insights to streamline planning, automate routine tasks, and keep your team focused on growth.
            </p>
            <div className="mt-8 space-y-4 rounded-3xl border border-cyan-400/10 bg-white/5 p-6">
              {[
                "Automated forecasting for revenue and inventory",
                "Smart reminders for approvals, payroll, and payments",
                "Insights to keep your business efficient and compliant",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-zinc-300">
                  <span className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-200">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[3rem] border border-white/10 bg-gradient-to-b from-cyan-400/10 via-transparent to-slate-950/50 p-10 shadow-[0_40px_120px_-80px_rgba(56,189,248,0.22)]">
            <div className="rounded-[2.5rem] border border-white/10 bg-slate-950/90 p-8 text-zinc-200">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Assistant preview</p>
              <div className="mt-6 space-y-5">
                <div className="rounded-3xl bg-slate-900/80 p-5">
                  <p className="text-sm text-cyan-200">"Show me the top five underperforming stores this month."</p>
                </div>
                <div className="rounded-3xl bg-slate-900/80 p-5">
                  <p className="text-sm text-zinc-300">
                    "Your reporting engine shows the Lagos warehouse needs attention: stock levels are 32% below target and sales are slowing in the support region."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-20 space-y-10">
          <SectionHeader
            eyebrow="Industries"
            title="Serving businesses across African markets and beyond."
            description="From retail and hospitality to clinics and construction, Rock Frost Business Suite adapts to your industry."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {industries.map((industry) => (
              <div key={industry} className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-zinc-200 shadow-sm">
                {industry}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-[3rem] border border-white/10 bg-slate-950/80 p-10 text-center shadow-[0_35px_140px_-90px_rgba(255,255,255,0.15)] sm:p-14">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Pricing preview</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Choose a plan that fits your growth stage.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Every plan includes secure onboarding, expert support, and tailored guidance for your business.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div key={plan.plan} className="rounded-[2.5rem] border border-white/10 bg-slate-950/80 p-8">
                <p className="text-sm uppercase tracking-[0.26em] text-cyan-200/80">{plan.plan}</p>
                <h3 className="mt-4 text-2xl font-semibold text-white">{plan.plan === "Enterprise" ? "Flexible pricing" : "Contact Sales"}</h3>
                <p className="mt-3 text-sm leading-7 text-zinc-300">{plan.description}</p>
                <button className="mt-8 inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
                  {plan.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-[3rem] border border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-slate-950/80 p-10 text-center shadow-[0_45px_140px_-95px_rgba(56,189,248,0.25)] sm:p-14">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Ready to start</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Turn ideas into infinite possibilities.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Join African leaders using Rock Frost Business Suite to manage growth, improve efficiency, and deliver better customer outcomes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="w-full sm:w-auto">
              <Button className="w-full">Request Demo</Button>
            </Link>
            <Link href="/features" className="w-full sm:w-auto">
              <Button variant="ghost" className="w-full">
                Explore Modules
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
