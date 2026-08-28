import { ShieldCheck, KeyRound, Building2, Landmark } from "lucide-react";
import { IconBadge } from "@/components/ui/icon-badge";

/**
 * Real, currently-implemented product claims only. See
 * docs/COMPLIANCE_AND_ASSURANCE.md, which distinguishes implemented controls
 * from any third-party audit or regulatory sign-off. Never state that an
 * external authority has audited, certified, or approved the platform, and
 * never state an adoption metric, unless a current document from that exact
 * authority supports the exact statement.
 */
const REASONS = [
  {
    icon: ShieldCheck,
    title: "Tenant isolation, enforced server-side",
    description: "Every query is scoped to your organization at the server layer, not just hidden in the interface, with role-based permissions down to individual actions.",
  },
  {
    icon: KeyRound,
    title: "Real account security",
    description: "Bcrypt-hashed passwords, signed host-only sessions, login lockout after repeated failures, and two-factor authentication via an authenticator app or SMS.",
  },
  {
    icon: Building2,
    title: "Sixteen systems, one workspace",
    description: "Fleet, Accounting, HR & Payroll, Pharmacy, Hospital, and more, each with its own data and workflows, without switching platforms or re-entering records.",
  },
  {
    icon: Landmark,
    title: "Built for Ghana",
    description: "GHS pricing and reporting by default, Ghana Data Protection Act readiness work already under way, and every financial event recorded in a tenant-scoped audit trail.",
  },
] as const;

export function WhyRockFrost() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl space-y-2">
        <p className="public-eyebrow">Why Rock Frost</p>
        <h2 className="text-2xl font-semibold tracking-tight">Built to be trusted with your operating data</h2>
      </div>
      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {REASONS.map((reason) => (
          <div key={reason.title} className="flex gap-4">
            <IconBadge size="lg" className="mt-0.5">
              <reason.icon className="size-5" />
            </IconBadge>
            <div className="space-y-1">
              <h3 className="font-medium">{reason.title}</h3>
              <p className="text-sm text-muted-foreground">{reason.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
