import { ShieldCheck, Layers, Building2, Wallet } from "lucide-react";
import { IconBadge } from "@/components/ui/icon-badge";

/**
 * Keep public trust claims within the evidence in docs/COMPLIANCE_AND_ASSURANCE.md.
 * Do not imply independent certification, regulatory approval, or universal
 * integration behavior.
 */
const REASONS = [
  {
    icon: ShieldCheck,
    title: "Organization-scoped access",
    description: "Server-side permissions and organization-scoped data boundaries help keep each team's records within its authorized workspace.",
  },
  {
    icon: Layers,
    title: "Focused tools for specialist work",
    description: "Modules keep their own workflows, navigation, and permissions, so teams can work in the parts of the platform relevant to their role.",
  },
  {
    icon: Building2,
    title: "Connect the modules your operation needs",
    description: "Start with products such as Fleet, Accounting, HR, Pharmacy, Hospital, or School, then review documented connections for the workflows you want to join.",
  },
  {
    icon: Wallet,
    title: "A Ghana-first business context",
    description: "The public product catalogue is priced in GHS, and Accounting includes local tax workflows. Compliance readiness is a continuing process, not a certification claim.",
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
