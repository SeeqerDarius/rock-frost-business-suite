interface FeatureCardProps {
  title: string;
  description: string;
}

export function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="card-glow-hover group rounded-2xl border border-[#1a6dff]/12 bg-[#040a14] p-6 transition hover:border-[#1a6dff]/35 sm:p-8">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#94a3b8]">{description}</p>
    </article>
  );
}
