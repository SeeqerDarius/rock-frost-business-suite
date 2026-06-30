import Link from "next/link";

const productLinks = [
  { label: "Modules", href: "/modules" as const },
  { label: "Features", href: "/features" as const },
  { label: "Pricing", href: "/pricing" as const },
];

const companyLinks = [
  { label: "About", href: "/about" as const },
  { label: "Contact", href: "/contact" as const },
];

const contactDetails = [
  { label: "Email", value: "info@rockfrostgroup.com", href: "mailto:info@rockfrostgroup.com" },
  { label: "Support", value: "support@rockfrostgroup.com", href: "mailto:support@rockfrostgroup.com" },
  { label: "Sales", value: "sales@rockfrostgroup.com", href: "mailto:sales@rockfrostgroup.com" },
];

const socialLinks = [
  { label: "GitHub", href: "https://github.com/SeeqerDarius" },
  { label: "LinkedIn", href: "#" },
  { label: "Facebook", href: "#" },
  { label: "TikTok", href: "#" },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-[#1a6dff]/20 bg-[#000000] py-12 text-[#94a3b8] sm:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, #1a6dff 30%, #0ea5e9 50%, #1a6dff 70%, transparent 100%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at center, rgba(26,109,255,0.05) 0%, transparent 60%)" }} />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 sm:px-8 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr]">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#3b8eff]">Company</p>
            <p className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
              <span className="text-gradient-silver">ROCK</span> <span className="text-gradient-blue">FROST</span>
            </p>
            <p className="max-w-xl text-sm uppercase leading-7 tracking-[0.25em] text-[#6b7f96]">
              Turning ideas into infinite possibilities.
            </p>
            <p className="max-w-xl text-sm leading-7 text-[#6b7f96]">
              Rock Frost Business Suite is the premium enterprise platform for intelligent operations, teams, payments, and analytics.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-[#1a6dff]/15 bg-[#040a14]/80 p-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">Contact</p>
            <div className="mt-4 space-y-2 text-sm leading-7 text-[#94a3b8]">
              {contactDetails.map((item) => (
                <p key={item.label}><span className="text-white">{item.label}:</span> <a href={item.href} className="transition hover:text-[#3b8eff]">{item.value}</a></p>
              ))}
              <p>Phone: <span className="text-white">+233540658389</span></p>
              <p>WhatsApp: <span className="text-white">+233554671026</span></p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3b8eff]">Product</p>
          <div className="mt-6 space-y-3">
            {productLinks.map((item) => (
              <Link key={item.label} href={item.href} className="block text-sm text-[#94a3b8] transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3b8eff]">Company</p>
          <div className="mt-6 space-y-3">
            {companyLinks.map((item) => (
              <Link key={item.label} href={item.href} className="block text-sm text-[#94a3b8] transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3b8eff]">Connect</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {socialLinks.map((item) => (
              <a key={item.label} href={item.href} className="card-glow-hover rounded-2xl border border-[#1a6dff]/20 bg-[#040a14]/80 px-4 py-3 text-sm text-[#94a3b8] transition hover:text-white">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#3b8eff]">{item.label}</p>
                <p className="mt-2 text-white">{item.label}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl px-6 sm:px-8">
        <div className="steel-divider" />
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#6b7f96]">© 2026 Rock Frost Technologies. All Rights Reserved.</p>
          <div className="flex items-center gap-3 text-xs text-[#6b7f96]">
            <div className="rounded-full border border-[#1a6dff]/20 bg-[#040a14]/80 px-3 py-2 transition hover:border-[#1a6dff]/50 hover:text-white">Powered by Rock Frost Group</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
