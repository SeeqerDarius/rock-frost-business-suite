interface SectionTableProps {
  title: string;
  columns: string[];
  rows: Array<string[]>;
}

export function SectionTable({ title, columns, rows }: SectionTableProps) {
  return (
    <div className="glass-card overflow-hidden rounded-3xl border border-white/10 shadow-sm shadow-blue-500/10">
      <div className="border-b border-white/10 bg-[#02060e]/95 px-6 py-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-200">
          <thead className="bg-[#02060e]/90 text-slate-400">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-6 py-4 font-semibold tracking-[0.02em]">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-white/2" : "bg-white/5"}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-6 py-4 text-slate-200">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
