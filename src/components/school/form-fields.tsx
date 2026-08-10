import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Labelled form controls shared by every School page.
 *
 * School forms post directly to Server Actions in
 * `src/app/app/school/actions.ts`, so every control here stays a native
 * form element: the field name/value pairs must survive a no-JavaScript
 * submit. Each control is always paired with a real `<label for>` so the
 * accessible name never depends on placeholder text.
 */

function FieldShell({ htmlFor, label, hint, className, children }: { htmlFor: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({ id, name, label, hint, className, ...props }: React.ComponentProps<"input"> & { id: string; name: string; label: string; hint?: string }) {
  return (
    <FieldShell htmlFor={id} label={label} hint={hint} className={className}>
      <Input id={id} name={name} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Native select. Base UI's `Select` is a client component that does not
 * post a value in a plain Server Action form, so operational School forms
 * intentionally use the native control.
 */
export function SelectField({ id, name, label, options, hint, placeholder = "Select…", className, emptyHint, ...props }: Omit<React.ComponentProps<"select">, "children"> & { id: string; name: string; label: string; options: SelectOption[]; hint?: string; placeholder?: string; emptyHint?: string }) {
  const isEmpty = options.length === 0;
  return (
    <FieldShell htmlFor={id} label={label} hint={isEmpty ? (emptyHint ?? hint) : hint} className={className}>
      <select
        id={id}
        name={name}
        disabled={isEmpty || props.disabled}
        aria-describedby={hint || emptyHint ? `${id}-hint` : undefined}
        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"
        {...props}
      >
        <option value="">{isEmpty ? "None available" : placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ id, name, label, hint, defaultChecked, disabled }: { id: string; name: string; label: string; hint?: string; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-lg border p-3">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5 size-4 accent-primary" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Standard two/three-column responsive grid used inside School dialogs and forms. */
export function FieldGrid({ columns = 2, className, children }: { columns?: 1 | 2 | 3; className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}
