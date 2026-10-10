import {
  Boxes,
  Calculator,
  ChevronRight,
  LayoutDashboard,
  Pill,
  Truck,
  UsersRound,
} from "lucide-react";

const WORKSPACE_MODULES = [
  { name: "Accounting", detail: "Invoices, expenses and reports", icon: Calculator },
  { name: "Fleet", detail: "Vehicles, drivers and maintenance", icon: Truck },
  { name: "People", detail: "Employees, leave and payroll", icon: UsersRound },
  { name: "Inventory", detail: "Stock, orders and suppliers", icon: Boxes },
] as const;

export function HomepageWorkspacePreview() {
  return (
    <figure className="mx-auto w-full max-w-[34rem]">
      <div
        role="img"
        aria-label="Illustrative Rock Frost workspace preview with Accounting, Fleet, People, and Inventory modules"
        className="overflow-hidden rounded-xl border bg-card shadow-xl shadow-foreground/10"
      >
        <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-foreground/20" />
            <span className="size-2 rounded-full bg-foreground/20" />
            <span className="size-2 rounded-full bg-foreground/20" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-1 text-left text-[11px] text-muted-foreground">
            app.rockfrostgroup.com/app
          </span>
          <span className="hidden rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            Your workspace
          </span>
        </div>

        <div className="grid min-h-[18rem] grid-cols-[8.5rem_1fr] sm:grid-cols-[10rem_1fr]">
          <aside className="border-r bg-muted/20 p-3 sm:p-4">
            <p className="truncate text-xs font-semibold">Business workspace</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Role-based access</p>
            <div className="mt-5 space-y-1">
              <div className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-2 text-xs font-medium text-primary">
                <LayoutDashboard className="size-3.5" aria-hidden="true" />
                Overview
              </div>
              {["Modules", "Reports", "Organization"].map((label) => (
                <div key={label} className="rounded-md px-2 py-2 text-xs text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">One connected workspace</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">Work, organized around your team</h2>
              </div>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
                <Pill className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
              Give each person the systems and information their role calls for.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {WORKSPACE_MODULES.map((module) => (
                <div key={module.name} className="group flex min-w-0 items-center gap-2.5 rounded-lg border bg-background p-2.5 sm:p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <module.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{module.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{module.detail}</span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Start with one system. Connect more as your needs grow.
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Illustrative workspace preview. The modules shown depend on each organization’s subscription and user access.
      </figcaption>
    </figure>
  );
}
