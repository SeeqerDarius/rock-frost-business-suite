"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { saveOrganizationModuleBranding, resetOrganizationModuleBranding } from "@/app/app/(overview)/organization/settings/actions";
import { getContrastingForeground } from "@/lib/module-branding";

type Props = { moduleKey: string; moduleName: string; displayName: string; logoUrl: string | null; primaryColor: string; accentColor: string; surfaceColor: string; organizationName: string };

export function ModuleBrandingEditor({ moduleKey, moduleName, displayName, logoUrl, primaryColor, accentColor, surfaceColor, organizationName }: Props) {
  const [name, setName] = useState(displayName);
  const [color, setColor] = useState(primaryColor);
  const [accent, setAccent] = useState(accentColor);
  const [surface, setSurface] = useState(surfaceColor);
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : logoUrl, [file, logoUrl]);
  useEffect(() => () => { if (file && previewUrl) URL.revokeObjectURL(previewUrl); }, [file, previewUrl]);
  const previewName = name.trim() || organizationName;
  const previewColor = color || "#2563eb";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <form action={saveOrganizationModuleBranding} className="space-y-4">
        <input type="hidden" name="moduleKey" value={moduleKey} />
        <div className="space-y-2"><Label htmlFor={`name-${moduleKey}`}>Module display name</Label><Input id={`name-${moduleKey}`} name="displayName" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={moduleName} /></div>
        <div className="space-y-2"><Label htmlFor={`logo-${moduleKey}`}>Logo (JPG, PNG, or WebP, up to 1 MB)</Label><Input id={`logo-${moduleKey}`} name="logo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
        {logoUrl ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" />Remove the current module logo</label> : null}
        <div className="space-y-2"><Label htmlFor={`color-${moduleKey}`}>Primary brand color</Label><div className="flex items-center gap-3"><input id={`color-${moduleKey}`} aria-label={`${moduleName} primary color`} type="color" value={color || "#2563eb"} onChange={(event) => setColor(event.target.value)} className="size-10 cursor-pointer rounded border bg-background p-1" /><Input name="primaryColor" value={color} onChange={(event) => setColor(event.target.value)} placeholder="Inherit default" maxLength={7} className="max-w-40" /></div><p className="text-xs text-muted-foreground">Choose a color or clear the value to use the system default. Text contrast is selected automatically.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor={`accent-${moduleKey}`}>Accent color</Label><div className="flex items-center gap-2"><input id={`accent-${moduleKey}`} aria-label={`${moduleName} accent color`} type="color" value={accent || "#eaf0f8"} onChange={(event) => setAccent(event.target.value)} className="size-10 cursor-pointer rounded border bg-background p-1" /><Input name="accentColor" value={accent} onChange={(event) => setAccent(event.target.value)} placeholder="Inherit default" maxLength={7} /></div></div>
          <div className="space-y-2"><Label htmlFor={`surface-${moduleKey}`}>Surface color</Label><div className="flex items-center gap-2"><input id={`surface-${moduleKey}`} aria-label={`${moduleName} surface color`} type="color" value={surface || "#ffffff"} onChange={(event) => setSurface(event.target.value)} className="size-10 cursor-pointer rounded border bg-background p-1" /><Input name="surfaceColor" value={surface} onChange={(event) => setSurface(event.target.value)} placeholder="Inherit default" maxLength={7} /></div></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="submit" size="sm">Save module branding</Button><Button type="submit" size="sm" variant="outline" formAction={resetOrganizationModuleBranding} formNoValidate>Reset to organization defaults</Button></div>
      </form>
      <aside aria-label={`${moduleName} branding preview`} className="space-y-3 rounded-xl border p-4" style={{ backgroundColor: surface || "var(--background)" }}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border p-3" style={{ borderColor: previewColor }}>
          {previewUrl ? <Image src={previewUrl} alt="" width={40} height={40} unoptimized className="size-10 rounded object-contain" /> : <div className="flex size-10 items-center justify-center rounded bg-muted text-sm font-semibold">{previewName.slice(0, 1).toUpperCase()}</div>}
          <span className="min-w-0 truncate font-semibold">{previewName}</span>
        </div>
        <button type="button" className="rounded-md px-3 py-2 text-sm font-medium" style={{ backgroundColor: previewColor, color: getContrastingForeground(previewColor) }}>Primary action</button><span className="ml-2 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: accent || "var(--accent)", color: accent ? getContrastingForeground(accent) : "var(--accent-foreground)" }}>Accent</span>
        <p className="text-xs text-muted-foreground">Changes appear in this module’s workspace and module switcher.</p>
      </aside>
    </div>
  );
}
