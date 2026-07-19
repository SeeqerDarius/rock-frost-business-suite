import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

const primaryLinks = [
  { label: "Solutions", href: "/solutions" },
  { label: "Modules", href: "/modules" },
  { label: "Industries", href: "/industries" },
  { label: "Company", href: "/company" },
  { label: "Contact", href: "/contact" },
];

export function PublicHeader() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {primaryLinks.map((link) => (
            <Link key={link.href} href={link.href as never} className="transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button nativeButton={false} render={<Link href="/contact" />}>
            Request demo
          </Button>
        </div>
      </div>
    </header>
  );
}
