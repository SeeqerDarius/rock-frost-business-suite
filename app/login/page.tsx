import Link from "next/link";
import { MarketingLayout } from "../components/MarketingLayout";

export default function LoginPage() {
  return (
    <MarketingLayout className="flex min-h-[calc(100vh-96px)] items-center max-w-7xl">
      <div className="card-glow-hover w-full relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] p-10 scan-overlay sm:p-14"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        {/* Background: blurred logo watermark */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "url('/RFG.png')", backgroundSize: '50%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: 0.03, filter: 'blur(3px)' }} />

        {/* Floating code strings */}
        <div className="pointer-events-none absolute left-8 top-10 float-code select-none font-mono text-[11px] text-[#1a6dff]/25 leading-6 hidden lg:block">
          <div>{"auth.signIn({ secure: true });"}</div>
          <div>{"session.resume(yourWorkspace);"}</div>
        </div>
        <div className="pointer-events-none absolute right-10 bottom-10 float-code-slow select-none font-mono text-[10px] text-[#0ea5e9]/20 leading-6 text-right hidden xl:block">
          <div>{"suite.dashboard.load();"}</div>
        </div>

        {/* Blue orb glows */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-blue"
          style={{ background: "radial-gradient(circle, rgba(26,109,255,0.12) 0%, transparent 70%)" }} />

        {/* Blue rim line at top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />

        <div className="relative space-y-6 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Login</span>
          </div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">
            Welcome back to{" "}
            <span className="text-gradient-blue">Rock Frost Business Suite.</span>
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-7 text-[#6b7f96]">
            Sign in to continue managing operations, teams, and customers from one intelligent platform.
          </p>
          <div className="steel-divider" />
        </div>

        <form className="relative mt-10 space-y-6">
          <label className="block text-sm text-[#94a3b8]">
            <span className="mb-3 inline-block">Email address</span>
            <input
              type="email"
              className="w-full rounded-2xl border border-[#1a6dff]/15 bg-[#040a14] px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm text-[#94a3b8]">
            <span className="mb-3 inline-block">Password</span>
            <input
              type="password"
              className="w-full rounded-2xl border border-[#1a6dff]/15 bg-[#040a14] px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
              placeholder="Enter your password"
            />
          </label>
          <button
            type="submit"
            className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white"
          >
            Continue to dashboard
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </button>
        </form>
        <p className="relative mt-8 text-center text-sm text-[#6b7f96]">
          Need help? <Link href="/contact" className="text-white underline decoration-[#1a6dff]/60">Contact sales</Link>
        </p>
      </div>
    </MarketingLayout>
  );
}