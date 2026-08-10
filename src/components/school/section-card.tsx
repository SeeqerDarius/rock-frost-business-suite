import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Titled section wrapper so every School list/form block is framed identically. */
export function SectionCard({ title, description, actions, className, children }: { title: string; description?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

export interface Prerequisite {
  /** Whether the prerequisite record already exists. */
  satisfied: boolean;
  label: string;
  href: string;
}

/**
 * Several School workflows cannot start until setup records exist — you
 * cannot enroll without a campus, class, and academic year. Previously
 * those pages still rendered their forms with empty dropdowns, which was a
 * dead end. This states what is missing and links straight to it.
 */
export function PrerequisiteNotice({ items }: { items: Prerequisite[] }) {
  const missing = items.filter((item) => !item.satisfied);
  if (missing.length === 0) return null;

  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>Finish setup before using this page</AlertTitle>
      <AlertDescription>
        <p>These records must exist first:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {missing.map((item) => (
            <Button key={item.href} size="sm" variant="outline" nativeButton={false} render={<Link href={item.href} />}>
              {item.label}
              <ArrowRight />
            </Button>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
