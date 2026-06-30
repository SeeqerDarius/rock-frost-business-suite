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
    <MarketingLayout className="max-w-7xl pb-28 pt-8">

      {/* ── HEADER SECTION ── */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] px-6 py-16 sm:px-10 lg:px-16"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        {/* Background: blurred logo watermark */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '55%', backgroundPosition: 'right -5% center', backgroundRepeat: 'no-repeat', opacity: 0.04, filter: 'blur(2px)' }} />

        {/* Floating code strings */}
        <div className="pointer-events-none absolute left-8 top-16 float-code select-none font-mono text-[11px] text-[#1a6dff]/30 leading-6 hidden lg:block">
          <div>{"const features = suite.capabilities();"}</div>
          <div>{"features.ai.enable({ predict: true });"}</div>
          <div>{"features.payments.reconcile();"}</div>
          <div>{"features.analytics.deep = true;"}</div>
          <div>{"features.deploy(africa);"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-12 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"suite.features.mobile({ secure: true });"}</div>
          <div>{"suite.crm.align(yourTeam);"}</div>
        </div>

        {/* Blue orb glows */}
        <div className="pointer-events-none absolute left-1/3 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.12) 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)" }} />

        {/* Blue rim line at top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Features</span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem]">
            Modern capabilities for{" "}
            <span className="text-gradient-blue">every business challenge.</span>
          </h1>
          <p className="max-w-xl text-base leading-8 text-[#6b7f96] sm:text-lg">
            A suite of intelligent tools that help teams run operations, deliver value, and stay aligned.
          </p>
          <div className="steel-divider" />
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="mt-24 grid gap-5 md:grid-cols-2">
        {features.map((feature, i) => (
          <div key={feature.title}
            className="card-glow-hover group relative overflow-hidden rounded-2xl border border-[#1a6dff]/12 bg-[#040a14] p-7 transition hover:border-[#1a6dff]/35"
            style={{ boxShadow: "0 4px 24px -8px rgba(0,0,0,0.6)" }}>
            {/* Hover glow */}
            <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(26,109,255,0.06) 0%, transparent 60%)" }} />
            {/* Top accent on hover */}
            <div className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "linear-gradient(90deg, transparent, #1a6dff, transparent)" }} />

            <div className="relative flex gap-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1a6dff]/25 bg-[#1a6dff]/10">
                <span className="font-mono text-xs font-semibold text-[#3b8eff]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2.5 text-sm leading-7 text-[#6b7f96]">{feature.description}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── AI CAPABILITY SPOTLIGHT ── */}
      <section className="mt-24 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div className="card-glow-hover flex flex-col rounded-[2.5rem] border border-[#1a6dff]/15 bg-[#040a14] p-10"
          style={{ boxShadow: "0 30px 90px -50px rgba(26,109,255,0.2)" }}>
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">AI-driven guidance</p>
          <h2 className="mt-5 text-3xl font-semibold text-white sm:text-4xl">
            Predictive intelligence{" "}
            <span className="text-gradient-blue">built into the platform.</span>
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6b7f96]">
            Rock Frost's AI layer works across every module — surfacing insights, flagging risks, and automating the routine so your team can focus on growth.
          </p>
          <div className="card-glow-hover mt-8 flex-1 space-y-3 rounded-2xl border border-[#1a6dff]/12 bg-black/60 p-6">
            {[
              "Automated revenue and inventory forecasting",
              "Smart alerts for approvals, payroll, and deadlines",
              "Compliance insights tailored to your region",
            ].map((item, i) => (
              <div key={item} className="flex items-start gap-3.5 text-sm text-[#94a3b8]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 text-[10px] font-semibold text-[#3b8eff]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal preview */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-black scan-overlay"
          style={{ boxShadow: "0 0 60px -15px rgba(26,109,255,0.25), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <div className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(26,109,255,0.08) 0%, transparent 60%)" }} />

          <div className="relative p-8 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Live insight</span>
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-[#1a6dff]/25 bg-[#1a6dff]/15 px-5 py-4">
                  <p className="text-sm text-[#93c5fd]">{"Which features are driving the most revenue this quarter?"}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10">
                  <span className="text-[8px] font-bold text-[#3b8eff]">RF</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-white/5 bg-[#040a14] px-5 py-4">
                  <p className="text-sm leading-7 text-[#94a3b8]">
                    Payments and reconciliation is up{" "}
                    <span className="text-[#22c55e] font-semibold">+41% QoQ</span>.
                    Analytics dashboards have driven a{" "}
                    <span className="text-[#1a6dff] font-semibold">28% reduction</span>{" "}
                    in decision time across your top accounts.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1a6dff]/12 bg-[#040a14]/80 p-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff] mb-4">Feature adoption</p>
                <div className="space-y-3">
                  {[
                    { name: "Payments", pct: 91, color: "#22c55e" },
                    { name: "Analytics", pct: 78, color: "#1a6dff" },
                    { name: "CRM", pct: 64, color: "#f59e0b" },
                    { name: "AI guidance", pct: 47, color: "#0ea5e9" },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-[#6b7f96]">{row.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                      </div>
                      <span className="w-8 text-right font-mono text-[#b8c5d6]">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mt-24 relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-black p-10 text-center sm:p-16"
        style={{ boxShadow: "0 0 100px -30px rgba(26,109,255,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '50%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: 0.03, filter: 'blur(4px)' }} />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.1) 0%, transparent 65%)" }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#3b8eff]">See it live</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
            See the platform{" "}
            <span className="text-gradient-blue">in action.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#6b7f96] sm:text-base">
            Request a demo to learn how Rock Frost Business Suite brings your teams, systems, and customers together.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white sm:w-auto">
              Request Demo
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link href="/pricing" className="inline-flex w-full items-center justify-center rounded-full border border-[#b8c5d6]/20 bg-transparent px-8 py-4 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white sm:w-auto">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}