interface PricingCardProps {
  plan: string;
  description: string;
  actionLabel: string;
  features: string[];
  accent?: "cyan" | "violet" | "amber";
}

const accentStyles: Record<NonNullable<PricingCardProps["accent"]>, string> = {
  cyan: "border-cyan-400/25 bg-cyan-400/5",
  violet: "border-violet-400/20 bg-violet-400/5",
  amber: "border-amber-300/20 bg-amber-300/5",
};

export function PricingCard({
  plan,
  description,
  actionLabel,
  features,
  accent = "cyan",
}: PricingCardProps) {
  return (
    <div className={`rounded-[2rem] border p-8 shadow-[0_30px_120px_-110px_rgba(0,0,0,0.45)] ${accentStyles[accent]}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-cyan-200/80">{plan}</p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">{plan === "Enterprise" ? "Custom" : "Modern"}</h3>
        </div>
      </div>
      <p className="mt-6 text-sm leading-7 text-zinc-300">{description}</p>
      <div className="mt-8 space-y-4">
        {features.map((feature) => (
          <div key={feature} className="flex items-start gap-3 text-sm leading-7 text-zinc-300">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-cyan-200">
              ✓
            </span>
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <button className="mt-8 inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
        {actionLabel}
      </button>
    </div>
  );
}
