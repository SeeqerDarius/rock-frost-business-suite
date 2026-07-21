import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CompanyPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium text-muted-foreground">Company</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Rock Frost Technologies</h1>
          <p className="text-lg text-muted-foreground">
            We build Rock Frost Business Suite: a modular business operating platform for organizations that run
            more than one kind of operation and don&apos;t want their systems tangled together.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 sm:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">What we believe</h2>
              <p className="text-muted-foreground">
                Most businesses end up running several unrelated systems that were never designed to share a
                platform, and the usual fix is either a pile of disconnected tools, or one monolithic app where
                everything gets tangled together. We think there&apos;s a better way: one platform, with real
                boundaries between the systems it hosts.
              </p>
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">How we build</h2>
              <p className="text-muted-foreground">
                Every module we ship is built and shipped as its own complete system, with its own data and
                navigation, on shared infrastructure (authentication, organizations, roles, and reporting) that
                every module gets for free. See our <Link href="/solutions" className="underline underline-offset-4">Solutions</Link> page for how that plays out in practice.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Want to work with us?</h2>
            <p className="text-muted-foreground">We&apos;d like to hear about what your organization runs on.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/contact" />}>
            Contact us
          </Button>
        </div>
      </section>
    </>
  );
}
