import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moduleRegistry } from "@/platform/modules/registry";

export default function PublicModulesPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium text-muted-foreground">Modules</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Independent business systems, one platform.
          </h1>
          <p className="text-lg text-muted-foreground">
            Every module is a complete, self-contained business system with its own data, navigation, and
            workflows. Activate the ones your organization needs today; more are on the way.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleRegistry.map((mod) => (
              <Card key={mod.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <mod.icon className="size-6 text-muted-foreground" />
                    <Badge variant={mod.status === "available" ? "default" : "outline"}>
                      {mod.status === "available" ? "Available" : "Coming soon"}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3">{mod.name}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                {mod.status === "available" ? (
                  <CardContent className="flex flex-wrap gap-2">
                    <Button size="sm" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${mod.key}`} />}>
                      Request demo
                    </Button>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/contact?intent=module&module=${mod.key}`} />}>
                      Request module
                    </Button>
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Don&apos;t see the module you need?</h2>
            <p className="text-muted-foreground">Tell us what your organization runs on. It helps shape what we build next.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/contact" />}>
            Get in touch
          </Button>
        </div>
      </section>
    </>
  );
}
