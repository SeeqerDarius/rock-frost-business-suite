interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200/80">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {description ? (
        <p className="max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}
