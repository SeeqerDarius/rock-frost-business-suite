import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Info, Link2, Lock, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { isPlatformAnchorOrganization } from "@/lib/platform-organizations";
import { formatGhs } from "@/lib/pricing-shared";
import { db } from "@/lib/db";
import { parseOrganizationModuleConfiguration } from "@/platform/module-requests/configuration";
import { configurableFeature, type ConfigurableFeature } from "@/platform/modules/feature-catalogue";
import { getModule } from "@/platform/modules/registry";
import { MODULE_STATUS_LABELS, getOrganizationModuleConfiguration, type FeatureView } from "@/platform/organizations/module-configuration-view";
import { ConfirmedSwitch } from "./confirmed-switch";
import { updateOrganizationModuleConfiguration } from "./actions";

const STATUS_VARIANT = { enabled: "default", "enabled-unpaid": "destructive", disabled: "outline", addon: "secondary", unavailable: "outline" } as const;

/**
 * One module, for one organization: where it stands (platform availability,
 * organization access, subscription facts, effective access), what it
 * includes, which features can be configured, and how they depend on each
 * other. Every switch posts to a server action that re-checks the platform
 * operator, dependencies, and the value this page showed.
 */
export default async function OrganizationModuleConfigurationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; moduleId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePlatformOperator();
  const { organizationId, moduleId } = await params;
  if (await isPlatformAnchorOrganization(organizationId)) notFound();
  const { saved, error } = await searchParams;
  const [view, assignment] = await Promise.all([
    getOrganizationModuleConfiguration(organizationId, moduleId),
    db.organizationModule.findUnique({ where: { organizationId_moduleId: { organizationId, moduleId } }, select: { configuration: true } }),
  ]);
  if (!view) notFound();
  const { organization, module: module_, status, entitlement, features, dependencies, seats, subscriptions } = view;
  const configuration = parseOrganizationModuleConfiguration(assignment?.configuration);
  const organizationHref = `/app/platform/organizations/${organization.id}?section=features`;
  const addons = features.filter((entry) => entry.feature.kind === "addon");
  const optional = features.filter((entry) => entry.feature.kind === "optional");
  const missingDependency = dependencies.requires.find((dependency) => !dependency.enabled);
  const enabledDependents = dependencies.requiredBy.filter((dependent) => dependent.enabled);
  const moduleBlocked = !entitlement.enabled && missingDependency
    ? `Switch on ${missingDependency.name} first. ${missingDependency.reason}`
    : entitlement.enabled && enabledDependents.length > 0
      ? `Switch off ${enabledDependents.map((dependent) => dependent.name).join(" and ")} first. It depends on ${module_.name}.`
      : module_.platformStatus !== "ACTIVE" ? "Unavailable for every organization. Make it available in Platform modules first." : null;
  const currentSubscription = subscriptions.find((subscription) => subscription.status !== "CANCELLED") ?? null;
  const routeFeature = new Map(features.flatMap((entry) => entry.feature.routes.map((route) => [route, entry] as const)));
  const groups = new Map<string, typeof module_.navigation>();
  for (const item of module_.navigation) groups.set(item.group ?? "Workspace", [...(groups.get(item.group ?? "Workspace") ?? []), item]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/app/platform/organizations" className="hover:text-foreground focus-visible:text-foreground">Organizations</Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <Link href={organizationHref} className="hover:text-foreground focus-visible:text-foreground">{organization.name}</Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">{module_.name}</span>
      </nav>

      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {organization.name}{organization.legalName && organization.legalName !== organization.name ? ` (${organization.legalName})` : ""} · {organization.tenantCode}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{module_.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{module_.description}</p>
        </div>
        <Badge variant={STATUS_VARIANT[status]} className="self-start">{MODULE_STATUS_LABELS[status].label}</Badge>
      </div>

      {saved ? <Alert><AlertTitle>Tenant settings saved</AlertTitle><AlertDescription>The validated settings now apply to this organization only.</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Tenant settings not saved</AlertTitle><AlertDescription>Use valid JSON with version, features, limits, workflow, terminology, and extensions fields.</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access for this organization</CardTitle>
          <CardDescription>{MODULE_STATUS_LABELS[status].help}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">{module_.name} is {entitlement.enabled ? "on" : "off"} for {organization.name}</p>
              <p className="text-sm text-muted-foreground">Switching it on adds it to the organization&apos;s launcher. It does not create a subscription or a charge.</p>
            </div>
            <ConfirmedSwitch
              target={{ kind: "module", organizationId: organization.id, moduleId: module_.id }}
              label={module_.name}
              value={entitlement.enabled}
              blockedReason={moduleBlocked}
              turnOnConsequence={`${module_.name} will appear for ${organization.name}. People whose role includes ${module_.name} permissions can open it straight away. No subscription or charge is created. A trial organization can have at most three products on.`}
              turnOffConsequence={`${module_.name} will disappear for everyone at ${organization.name}. Their records are kept and return if it is switched back on. Any subscription is not cancelled by this.`}
            />
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">Platform availability</dt>
              <dd className="font-medium">{module_.platformStatus === "ACTIVE" ? "Available to organizations" : "Unavailable for every organization"}{module_.publicListing ? "" : " (not listed on the public site)"}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">What people can open</dt>
              <dd className="font-medium">{entitlement.entitled ? "Open to members with a matching role" : entitlement.enabled ? "Blocked until the subscription is paid" : "Not available"}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
              <dt className="text-muted-foreground">Subscription and billing</dt>
              <dd className="space-y-1">
                {currentSubscription ? (
                  <>
                    <p className="font-medium">{currentSubscription.status.replaceAll("_", " ").toLowerCase()} · {currentSubscription.currency} {Number(currentSubscription.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })} for {currentSubscription.durationMonths} month{currentSubscription.durationMonths === 1 ? "" : "s"}{currentSubscription.endsAt ? ` · ends ${currentSubscription.endsAt.toLocaleDateString("en-GB")}` : ""}</p>
                    <p className="text-muted-foreground">From the recorded subscription. {entitlement.subscriptionControlled && !entitlement.paidAndCurrent ? "Because it is not paid and current, access is blocked even when the module is on." : "Access follows this subscription while it is paid and current."} Manage it in Plan and billing.</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No subscription is recorded for {module_.name}. Access depends only on the switch above, and nothing is billed through the platform for it.</p>
                )}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">User seats</dt>
              <dd className="font-medium">{seats ? (seats.limit === null ? `${seats.used} used, no limit` : `${seats.used} of ${seats.limit} used`) : "No seat limit recorded"}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">Who can use it inside the organization</dt>
              <dd>Members whose role holds a {module_.permissionPrefix ? <code className="text-xs">{module_.permissionPrefix}*</code> : "module"} permission. Roles are managed by the organization in Administration.</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {dependencies.requires.length > 0 || dependencies.requiredBy.length > 0 || dependencies.companionOf ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4" aria-hidden="true" />Dependencies</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {dependencies.requires.map((dependency) => (
                <li key={dependency.code} className="flex flex-wrap items-center gap-2">
                  <Badge variant={dependency.enabled ? "secondary" : "destructive"}>{dependency.enabled ? "Met" : "Missing"}</Badge>
                  Needs {dependency.name}. {dependency.reason}
                </li>
              ))}
              {dependencies.requiredBy.map((dependent) => (
                <li key={dependent.code} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{dependent.enabled ? "In use" : "Not in use"}</Badge>
                  {dependent.name} depends on {module_.name}{dependent.enabled ? `, so ${module_.name} cannot be switched off while ${dependent.name} is on.` : "."}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {features.length > 0 ? (
        <section aria-labelledby="features-heading" className="space-y-4">
          <div>
            <h2 id="features-heading" className="text-lg font-semibold">Features for {organization.name}</h2>
            <p className="text-sm text-muted-foreground">Each change asks for confirmation, is saved immediately, applies only to this organization, and is recorded in the audit log with who changed it and the old and new value.</p>
          </div>
          {addons.length > 0 ? <FeatureGroup title="Optional add-ons" description="Off until Rock Frost grants them. Granting is recorded here only: it does not create a subscription, invoice, or payment, so arrange billing separately." entries={addons} organizationId={organization.id} moduleKey={module_.code} organizationName={organization.name} /> : null}
          {optional.length > 0 ? <FeatureGroup title="Included capabilities you can switch off" description="Part of the module and on by default. Switch one off for an organization that does not use it. Records are kept." entries={optional} organizationId={organization.id} moduleKey={module_.code} organizationName={organization.name} /> : null}
        </section>
      ) : (
        <Alert>
          <Info />
          <AlertTitle>No separately configurable features</AlertTitle>
          <AlertDescription>Everything in {module_.name} is included when the module is on. Per-feature switches are added only where the server can enforce them.</AlertDescription>
        </Alert>
      )}

      {module_.navigation.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the module includes</CardTitle>
            <CardDescription>The workspace areas in {module_.name}, grouped the way people at the organization see them. Areas tied to a feature above show whether it is on.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            {[...groups.entries()].map(([group, items]) => (
              <div key={group}>
                <h3 className="mb-2 text-sm font-medium">{group}</h3>
                <ul className="space-y-2 text-sm">
                  {items.map((item) => {
                    const controlled = routeFeature.get(item.href);
                    return (
                      <li key={item.href}>
                        <span className="font-medium">{item.label}</span>{" "}
                        {controlled ? <Badge variant={controlled.value ? "secondary" : "outline"} className="ml-1">{controlled.feature.name}: {controlled.value ? "on" : "off"}</Badge> : <Badge variant="outline" className="ml-1">Included</Badge>}
                        {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">Advanced: tenant module settings (JSON)</summary>
        <div className="mt-4 space-y-4">
          <Alert>
            <TriangleAlert />
            <AlertTitle>These are the organization&apos;s own module settings</AlertTitle>
            <AlertDescription>
              Values such as number prefixes, reminder days, and reorder points, which the organization also edits from the module&apos;s Settings page. They are not entitlements: switching features on or off is done above, never here.
            </AlertDescription>
          </Alert>
          <form action={updateOrganizationModuleConfiguration} className="space-y-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <input type="hidden" name="moduleId" value={module_.id} />
            <div className="space-y-2">
              <Label htmlFor="configuration">Settings JSON</Label>
              <Textarea id="configuration" name="configuration" className="min-h-64 font-mono text-xs" defaultValue={JSON.stringify(configuration, null, 2)} spellCheck={false} />
            </div>
            <Button type="submit" variant="outline">Validate and save settings</Button>
          </form>
        </div>
      </details>

      <Button variant="outline" nativeButton={false} render={<Link href={organizationHref} />}>Back to {organization.name}</Button>
    </div>
  );
}

function FeatureGroup({ title, description, entries, organizationId, moduleKey, organizationName }: { title: string; description: string; entries: FeatureView[]; organizationId: string; moduleKey: string; organizationName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {entries.map((entry) => <FeatureRow key={entry.feature.key} entry={entry} organizationId={organizationId} moduleKey={moduleKey} organizationName={organizationName} />)}
      </CardContent>
    </Card>
  );
}

function featureName(key: string) {
  return configurableFeature(key)?.name ?? key;
}

function FeatureRow({ entry, organizationId, moduleKey, organizationName }: { entry: FeatureView; organizationId: string; moduleKey: string; organizationName: string }) {
  const { feature, value } = entry;
  const reach = feature.organizationWide ? feature.moduleKeys.map((key) => getModule(key)?.name ?? key) : [];
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{feature.name}</p>
          <Badge variant={feature.kind === "addon" ? "secondary" : "outline"}>{feature.kind === "addon" ? "Optional add-on" : "Included"}</Badge>
          {feature.organizationWide ? <Badge variant="outline">Whole organization</Badge> : null}
          <span className="text-xs text-muted-foreground">Default {feature.defaultEnabled ? "on" : "off"}</span>
        </div>
        <p className="text-sm text-muted-foreground">{feature.description}</p>
        {feature.organizationWide ? <p className="text-xs text-muted-foreground">One setting for {organizationName}. It also affects {reach.join(", ")}.</p> : null}
        {feature.requires.length > 0 ? <p className="text-xs">Needs: {feature.requires.map(featureName).join(", ")}.</p> : null}
        {feature.worksBestWith?.map((hint) => <p key={hint.key} className="text-xs text-muted-foreground">Works best with {featureName(hint.key)}. {hint.reason}</p>)}
        <p className="text-xs text-muted-foreground">{value ? feature.whenOn : feature.whenOff}</p>
        {feature.kind === "addon" ? (
          <p className="text-xs text-muted-foreground">
            {entry.confirmedPrice ? `Published price: starting from ${formatGhs(entry.confirmedPrice.monthlyGhs)} per month. ` : "No confirmed price is published. "}
            Granting does not bill the organization.
          </p>
        ) : null}
        {entry.conflict ? <p className="flex items-start gap-1 text-xs text-destructive"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{entry.conflict}</p> : null}
        <p className="flex items-start gap-1 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />{feature.enforcedBy}</p>
      </div>
      <ConfirmedSwitch
        target={{ kind: "feature", organizationId, moduleKey, featureKey: feature.key }}
        label={feature.name}
        value={value}
        blockedReason={entry.blockedReason}
        turnOnConsequence={`${feature.whenOn}${feature.kind === "addon" ? " This records the grant only. It does not create a subscription or charge." : ""}`}
        turnOffConsequence={feature.whenOff}
      />
    </div>
  );
}

export type { ConfigurableFeature };
