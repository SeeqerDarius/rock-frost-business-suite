interface DetailCardProps {
  title: string;
  details: Array<{ label: string; value: string }>;
  footer?: string;
}

export function DetailCard({ title, details, footer }: DetailCardProps) {
  return (
    <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-5 grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
        {details.map((detail) => (
          <div key={detail.label} className="rounded-3xl border border-white/5 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">{detail.label}</p>
            <p className="mt-2 font-medium text-slate-100">{detail.value}</p>
          </div>
        ))}
      </div>
      {footer ? <p className="mt-4 text-xs text-slate-400">{footer}</p> : null}
    </div>
  );
}
