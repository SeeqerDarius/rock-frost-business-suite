interface ModuleCardProps {
  title: string;
  description: string;
}

export function ModuleCard({ title, description }: ModuleCardProps) {
  return (
    <article className="rounded-3xl glass-card border border-white/10 p-6 shadow-[0_20px_120px_-105px_rgba(255,255,255,0.18)] transition hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-slate-900/50 sm:p-8">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-zinc-300">{description}</p>
    </article>
  );
}
