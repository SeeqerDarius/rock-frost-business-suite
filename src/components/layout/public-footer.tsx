import Link from "next/link";
import { CookieSettingsButton } from "@/components/privacy/cookie-settings-button";

export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Rock Frost Technologies. All rights reserved.</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/solutions" className="hover:text-foreground">Solutions</Link>
          <Link href="/modules" className="hover:text-foreground">Modules</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/industries" className="hover:text-foreground">Industries</Link>
          <Link href="/company" className="hover:text-foreground">Company</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
          <Link href="/cookie-policy" className="hover:text-foreground">Cookie policy</Link>
          <CookieSettingsButton />
        </nav>
      </div>
    </footer>
  );
}
