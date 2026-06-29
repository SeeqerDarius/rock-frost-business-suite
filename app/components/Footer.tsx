const industryLinks = [
  "Transport & Logistics",
  "Retail & Shops",
  "Schools",
  "Churches",
  "NGOs",
  "Hospitals & Clinics",
  "Hotels",
  "Construction",
  "Agriculture",
  "General Businesses",
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/95 py-16 text-zinc-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">Rock Frost Technologies</p>
            <p className="max-w-xl text-sm leading-7 text-zinc-400">
              Rock Frost Business Suite is the premium enterprise platform for intelligent operations, teams, payments, and analytics.
            </p>
          </div>
          <div className="rounded-3xl glass-card p-6 text-sm text-zinc-300 shadow-[0_20px_60px_-45px_rgba(56,189,248,0.4)]">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Contact</p>
            <p className="mt-4 leading-7">Call: <span className="text-white">+233540658389 | +23350764590 | +233598775671</span></p>
            <p className="leading-7">WhatsApp: <span className="text-white">+233554671026</span></p>
            <p className="leading-7">Email: <a href="mailto:rocfrostconsult@gmail.com" className="text-white underline decoration-cyan-400/50">rocfrostconsult@gmail.com</a></p>
            <p className="mt-4 text-xs text-zinc-500">Official email <span className="text-white">info@rockfrostgroup.com</span> coming soon.</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Popular modules</p>
          <div className="mt-6 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
            {[
              "Fleet Management",
              "Inventory Management",
              "POS & Sales",
              "CRM",
              "Payroll",
              "Reports & Analytics",
            ].map((item) => (
              <span key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Industries</p>
          <div className="mt-6 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
            {industryLinks.map((item) => (
              <span key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl px-6 text-center text-xs text-zinc-500 sm:px-8">
        © 2026 Rock Frost Technologies. All rights reserved.
      </div>
    </footer>
  );
}
