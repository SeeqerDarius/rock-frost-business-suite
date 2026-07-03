interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  Pending: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  Maintenance: "bg-sky-500/15 text-sky-200 border-sky-400/20",
  Completed: "bg-slate-500/15 text-slate-200 border-slate-400/20",
  Reviewed: "bg-cyan-500/15 text-cyan-200 border-cyan-400/20",
  Due: "bg-rose-500/15 text-rose-200 border-rose-400/20",
  In: "bg-slate-500/15 text-slate-200 border-slate-400/20",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const className = statusStyles[status] ?? "bg-white/5 text-slate-100 border-white/10";
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.24em] ${className}`}>
      {status}
    </span>
  );
}
