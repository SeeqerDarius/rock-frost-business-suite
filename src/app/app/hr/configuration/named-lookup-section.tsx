import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One Card section on the Configuration page for a simple organization-scoped
 * named lookup: a list with per-row delete, plus an inline add form. Shared by
 * all 7 simple lookups (Employee Types, Work Locations, Departure Reasons,
 * Working Schedules, Time Types, Job Positions, Contract Templates) so their
 * near-identical markup isn't hand-duplicated 7 times: the underlying Prisma
 * models stay distinct, only this presentation is shared. */
export function NamedLookupSection({
  title,
  icon,
  description,
  items,
  addAction,
  removeAction,
  extraField,
}: {
  title: string;
  icon: ReactNode;
  description: string;
  items: { id: string; name: string; extra?: string }[];
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
  extraField?: { name: string; label: string; options: Record<string, string>; defaultValue: string };
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None configured yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                <span>{item.name}{item.extra ? <span className="ml-2 text-xs text-muted-foreground">{item.extra}</span> : null}</span>
                <form action={removeAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" size="sm" variant="ghost"><X className="size-3.5" /></Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addAction} className="flex flex-wrap items-end gap-2">
          <Input name="name" placeholder="New name" className="h-8 max-w-xs" required />
          {extraField ? (
            <Select name={extraField.name} defaultValue={extraField.defaultValue} items={extraField.options}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(extraField.options).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
          <Button type="submit" size="sm" variant="outline"><Plus />Add</Button>
        </form>
      </CardContent>
    </Card>
  );
}
