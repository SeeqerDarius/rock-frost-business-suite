import Link from "next/link";
import type { Route } from "next";
import { MarketingLayout } from "../../components/MarketingLayout";

export default function InvitePage() {
  return (
    <MarketingLayout className="flex min-h-[calc(100vh-96px)] items-center max-w-7xl">
      <div className="card-glow-hover w-full rounded-[2.5rem] border border-[#1a6dff]/20 bg-[#000000] p-10 scan-overlay sm:p-14">
        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#1a6dff]/30 bg-[#1a6dff]/10 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a6dff] pulse-blue" />
            <span className="text-xs uppercase tracking-[0.35em] text-[#3b8eff]">Invite login</span>
          </div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Join your organization.</h1>
          <p className="mx-auto max-w-xl text-sm leading-7 text-[#6b7f96]">
            Use your invitation token to join the organization and access Rock Frost Business Suite.
          </p>
        </div>

        <form className="mt-10 space-y-6">
          <label className="block text-sm text-[#94a3b8]">
            <span className="mb-3 inline-block">Invitation token</span>
            <input
              type="text"
              className="w-full rounded-2xl border border-[#1a6dff]/15 bg-[#040a14] px-4 py-3 text-sm text-white outline-none transition focus:border-[#1a6dff]/50 focus:ring-2 focus:ring-[#1a6dff]/15"
              placeholder="Enter your invite token"
            />
          </label>
          <button type="submit" className="btn-blue inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white">
            Continue with invite
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-[#6b7f96]">
          Need help? <Link href="/contact" className="text-white underline decoration-[#1a6dff]/60">Contact support</Link>
        </p>
      </div>
    </MarketingLayout>
  );
}
