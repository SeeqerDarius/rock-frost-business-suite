import Link from "next/link";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_20%),linear-gradient(180deg,_#020617_0%,_#070b12_30%,_#05060b_100%)] text-white">
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-4xl items-center px-6 py-16 sm:px-8 lg:px-10">
        <div className="w-full rounded-[3rem] border border-white/10 bg-white/5 p-10 shadow-[0_35px_120px_-90px_rgba(255,255,255,0.15)] sm:p-14">
          <div className="space-y-6 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Login</p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Welcome back to Rock Frost Business Suite.</h1>
            <p className="mx-auto max-w-xl text-sm leading-7 text-zinc-300">
              Sign in to continue managing operations, teams, and customers from one intelligent platform.
            </p>
          </div>
          <form className="mt-10 space-y-6">
            <label className="block text-sm text-zinc-200">
              <span className="mb-3 inline-block">Email address</span>
              <input
                type="email"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm text-zinc-200">
              <span className="mb-3 inline-block">Password</span>
              <input
                type="password"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15"
                placeholder="Enter your password"
              />
            </label>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-cyan-400/90"
            >
              Continue to dashboard
            </button>
          </form>
          <p className="mt-8 text-center text-sm text-zinc-400">
            Need help? <Link href="/contact" className="text-white underline decoration-cyan-400/80">Contact sales</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
