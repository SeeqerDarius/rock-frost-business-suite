import Image from "next/image";
import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-3xl bg-slate-950 shadow-[0_20px_70px_-40px_rgba(56,189,248,0.75)]">
        <Image src="/RFG.png" alt="Rock Frost logo" fill sizes="48px" className="object-cover" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm uppercase tracking-[0.28em] text-white">Rock Frost</span>
        <span className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-200/85">Technologies</span>
      </span>
    </Link>
  );
}
