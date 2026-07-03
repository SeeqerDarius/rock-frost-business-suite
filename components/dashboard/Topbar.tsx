export function Topbar() {
  return (
    <div className="flex flex-col gap-4 border-b border-white/10 bg-[#03060f]/90 px-4 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Fleet Operations</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Rock Frost Fleet Control</h1>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full items-center rounded-3xl border border-white/10 bg-[#02050d] px-4 py-3 text-sm text-slate-300 shadow-sm shadow-blue-500/5 sm:max-w-xs">
          <span className="mr-3 text-cyan-300">🔎</span>
          <input
            type="search"
            placeholder="Search assets, vehicles, owners"
            className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Tenant</p>
          <p className="font-semibold text-slate-100">Organization workspace</p>
        </div>
      </div>
    </div>
  );
}
