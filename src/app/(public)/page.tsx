import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { moduleRegistry } from "@/platform/modules/registry";

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium text-muted-foreground">Rock Frost Business Suite</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            One platform. Every business system your organization runs on.
          </h1>
          <p className="text-lg text-muted-foreground">
            Activate independent management modules — fleet, installment sales, and more — from a single,
            unified workspace, without mixing unrelated business data together.
          </p>
          <div className="flex gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Modules</h2>
            <p className="text-muted-foreground">
              Each module is an independent business system with its own data, navigation, and workflows.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleRegistry.map((mod) => (
              <Card key={mod.key}>
                <CardHeader>
                  <mod.icon className="size-6 text-muted-foreground" />
                  <CardTitle className="mt-3">{mod.name}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-xs font-medium text-muted-foreground">
                    {mod.status === "available" ? "Available" : "Coming soon"}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
