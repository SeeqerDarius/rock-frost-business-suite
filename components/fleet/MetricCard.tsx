interface MetricCardProps {
  label: string;
  value: string;
  note?: string;
  accent?: "blue" | "silver";
  icon?: string;
}

const accentClasses = {
  blue: "from-blue-500 via-cyan-500 to-sky-400",
  silver: "from-slate-500 via-slate-400 to-slate-300",
};

export function MetricCard({ label, value, note, accent = "blue", icon }: MetricCardProps) {
  return (
    <div className="glass-card rounded-3xl border border-white/10 p-5 shadow-sm shadow-cyan-500/10 transition duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        {icon ? (
          <div className={`grid h-12 w-12 place-items-center rounded-3xl bg-gradient-to-br ${accentClasses[accent]} text-white shadow-lg shadow-cyan-500/20`}>
            <span className="text-lg">{icon}</span>
          </div>
        ) : null}
      </div>
      {note ? <p className="mt-4 text-sm text-slate-400">{note}</p> : null}
    </div>
  );
}
