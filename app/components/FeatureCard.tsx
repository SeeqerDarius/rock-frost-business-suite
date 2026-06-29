interface FeatureCardProps {
  title: string;
  description: string;
}

export function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="group rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_120px_-105px_rgba(255,255,255,0.25)] transition hover:-translate-y-1 hover:border-cyan-400/20 hover:bg-white/10 sm:p-8">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-zinc-300">{description}</p>
    </article>
  );
}
