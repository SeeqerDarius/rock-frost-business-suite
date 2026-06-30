interface PricingCardProps {
  plan: string;
  description: string;
  actionLabel: string;
  features: string[];
  accent?: "cyan" | "violet" | "amber";
}

const accentStyles: Record<NonNullable<PricingCardProps["accent"]>, string> = {
  cyan: "border-[#1a6dff]/20 bg-[#1a6dff]/5",
  violet: "border-[#1a6dff]/20 bg-[#1a6dff]/5",
  amber: "border-[#1a6dff]/20 bg-[#1a6dff]/5",
};

export function PricingCard({
  plan,
  description,
  actionLabel,
  features,
  accent = "cyan",
}: PricingCardProps) {
  return (
    <div className={`card-glow-hover rounded-[2rem] border border-[#1a6dff]/12 bg-black/60 p-8 shadow-[0_30px_120px_-110px_rgba(0,0,0,0.45)] ${accentStyles[accent]}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-[#3b8eff]">{plan}</p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">{plan === "Enterprise" ? "Custom" : "Modern"}</h3>
        </div>
      </div>
      <p className="mt-6 text-sm leading-7 text-[#94a3b8]">{description}</p>
      <div className="mt-8 space-y-4">
        {features.map((feature) => (
          <div key={feature} className="flex items-start gap-3 text-sm leading-7 text-[#94a3b8]">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1a6dff]/10 text-[#3b8eff]">
              ✓
            </span>
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <button className="mt-8 inline-flex w-full items-center justify-center rounded-full border border-[#1a6dff]/20 bg-transparent px-6 py-3 text-sm font-semibold text-[#b8c5d6] transition hover:border-[#1a6dff]/50 hover:text-white">
        {actionLabel}
      </button>
    </div>
  );
}
