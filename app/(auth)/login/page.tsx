import Link from "next/link";
import type { Route } from "next";
import { MarketingLayout } from "../../components/MarketingLayout";

export default function LoginPage() {
  return (
    <MarketingLayout className="flex min-h-[calc(100vh-96px)] items-center max-w-7xl">
      <div className="card-glow-hover w-full relative overflow-hidden rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] p-10 scan-overlay sm:p-14"
        style={{ boxShadow: "0 0 80px -20px rgba(26,109,255,0.25), 0 40px 120px -60px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        <div className="relative space-y-6 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Login</span>
          </div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">
            Welcome back to <span className="text-gradient-blue">Rock Frost Business Suite.</span>
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-7 text-[#6b7f96]">
            Sign in to continue managing operations, teams, and customers from one intelligent platform.
          </p>
          <div className="steel-divider" />
        </div>

        <form action="/api/auth/callback/credentials" method="post" className="relative mt-10 space-y-6">
          <label className="block text-sm text-[#94a3b8]">
            <span className="mb-3 inline-block">Email address</span>
            <input
              name="email"
              type="email"
              className="w-full rounded-2xl border border-[#1a6dff]/15 bg-[#040a14] px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm text-[#94a3b8]">
            <span className="mb-3 inline-block">Password</span>
            <input
              name="password"
              type="password"
              className="w-full rounded-2xl border border-[#1a6dff]/15 bg-[#040a14] px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
              placeholder="Enter your password"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#94a3b8]">
            <Link href={"/forgot-password" as Route} className="text-white underline decoration-[#1a6dff]/60">Forgot password?</Link>
            <Link href={"/invite" as Route} className="text-white underline decoration-[#1a6dff]/60">Use invite token</Link>
          </div>
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
