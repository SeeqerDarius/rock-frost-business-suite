import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

/**
 * Minimal public-site header for this foundation phase. The full marketing
 * navigation (Solutions, Modules, Industries, Company, Contact) is Phase 2
 * scope — those pages don't exist yet, so their links aren't added here until
 * they do. Keep this header this small until Phase 2 is approved.
 */
export function PublicHeader() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <Button variant="outline" nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
      </div>
    </header>
  );
}
