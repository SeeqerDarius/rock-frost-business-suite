import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/ui/icon-badge";
import { moduleRegistry } from "@/platform/modules/registry";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software Modules",
  description: "Explore modular business systems, including Hotel, School, and Pharmacy Management vertical suites.",
  path: "/modules",
  keywords: ["business software modules Ghana", "ERP modules Africa", "fleet CRM payroll inventory software"],
});

export default function PublicModulesPage() {
  return (
    <>
      <PublicHero eyebrow="Rock Frost Business Suite" title="Independent business systems. One exceptional platform." description="Every module is a complete, self-contained operating system with its own data, navigation, permissions, and workflows. Activate only what your organization needs." />

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleRegistry.map((mod) => (
              <Card key={mod.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <IconBadge size="lg"><mod.icon className="size-5" /></IconBadge>
                    <Badge variant={mod.status === "available" ? "default" : "outline"}>
                      {mod.status === "available" ? "Available" : "Coming soon"}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3">{mod.name}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                {mod.status === "available" ? (
                  <CardContent className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/modules/${mod.key}`} />}>
                      Learn more
                    </Button>
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
