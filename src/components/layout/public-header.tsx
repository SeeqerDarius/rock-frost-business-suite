import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { PublicMobileMenu } from "@/components/layout/public-mobile-menu";
import { publicNavLinks } from "@/components/layout/public-nav-links";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/75 backdrop-blur-xl supports-backdrop-filter:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav aria-label="Primary site navigation" className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
          {publicNavLinks.map((link) => (
            <Link key={link.href} href={link.href as never} className="transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden items-center gap-3 lg:flex">
            <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button nativeButton={false} render={<Link href="/subscribe" />}>
              Subscribe
            </Button>
          </div>
          <div className="lg:hidden">
            <PublicMobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
