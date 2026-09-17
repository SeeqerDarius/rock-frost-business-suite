import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/school/section-card";
import type { ModuleSeatUsage } from "@/platform/subscriptions/seats";
import type { OrganizationDetail } from "./data";
import { SettingRow } from "./shared";

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  DRAFT: "outline",
  PENDING_PAYMENT: "secondary",
  PAST_DUE: "destructive",
  EXPIRED: "outline",
  CANCELLED: "outline",
};

function humanize(value: string): string {
  const lower = value.replaceAll("_", " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * One module subscription is what this organization actually buys, so this is
 * the section that answers "what does this customer pay, for which module,
 * until when, and for how many people". Creating, activating, and cancelling
 * subscriptions stays on the platform Subscriptions page: that page works
 * across every tenant at once and duplicating its forms here would give two
 * places to do the same irreversible thing.
 *
 * Each module gets its own row rather than one flat ledger, because plan
 * tiers are per module: this row is where a module's tier and the depth it
 * unlocks belong.
 */
export function PlanSection({
  organization,
  seatUsage,
}: {
  organization: OrganizationDetail;
  seatUsage: ModuleSeatUsage[];
}) {
  const now = new Date();
  const usageByModuleId = new Map(seatUsage.map((usage) => [usage.moduleId, usage]));
  const subscriptionsByModule = new Map<string, OrganizationDetail["subscriptions"]>();
  for (const subscription of organization.subscriptions) {
    const existing = subscriptionsByModule.get(subscription.moduleId) ?? [];
    subscriptionsByModule.set(subscription.moduleId, [...existing, subscription]);
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Module subscriptions"
        description="Every agreement recorded for this organization, newest first within each module."
        actions={
          <>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/platform/subscriptions" />}>
              Subscriptions workspace
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/app/platform/billing?organizationId=${organization.id}`} />}
            >
              Payment history
            </Button>
          </>
        }
      >
        {organization.subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subscription is recorded for this organization. Its module access currently rests on the module switches in Modules and features, which is the legacy path and carries no dates, seats, or payment record. Create a subscription from the Subscriptions workspace to put it on a real agreement.
          </p>
        ) : (
          <div className="space-y-3">
            {[...subscriptionsByModule.values()].map((moduleSubscriptions) => {
              const [latest, ...history] = moduleSubscriptions;
              const usage = usageByModuleId.get(latest.moduleId);
              const inWindow = latest.status === "ACTIVE" && (!latest.endsAt || latest.endsAt > now);
              return (
                <SettingRow
                  key={latest.moduleId}
                  title={latest.module.name}
                  status={<Badge variant={STATUS_TONE[latest.status] ?? "outline"}>{humanize(latest.status)}</Badge>}
                  help={[
                    humanize(latest.mode),
                    `${latest.durationMonths} ${latest.durationMonths === 1 ? "month" : "months"}`,
                    `${latest.currency} ${latest.amount.toString()}`,
                    latest.autoRenew ? "Auto-renew on" : "Auto-renew off",
                  ].join(" · ")}
                  control={
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {latest.seatLimit == null ? "Unlimited seats" : `${usage?.used ?? 0} of ${latest.seatLimit} seats`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inWindow ? "Access is open" : "Access is not open"}
                      </p>
                    </div>
                  }
                >
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      {latest.startsAt ? latest.startsAt.toLocaleDateString() : "No start date"} to{" "}
                      {latest.endsAt ? latest.endsAt.toLocaleDateString() : "No end date"}
                      {latest.paymentReference ? ` · reference ${latest.paymentReference}` : ""}
                      {latest.paymentMethod ? ` · ${latest.paymentMethod}` : ""}
                    </p>
                    {latest.entitledModuleKeys.length > 0 ? (
                      <p>Suite agreement, also entitling: {latest.entitledModuleKeys.join(", ")}</p>
                    ) : null}
                    {latest.notes ? <p className="whitespace-pre-wrap">{latest.notes}</p> : null}
                    {history.length > 0 ? (
                      <p>
                        {history.length} earlier {history.length === 1 ? "agreement" : "agreements"} for this module:{" "}
                        {history.map((subscription) => `${humanize(subscription.status)} (${subscription.createdAt.toLocaleDateString()})`).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </SettingRow>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Seat usage by module"
        description="Counted from the permissions each member's role actually holds, so a member who can reach two modules takes a seat in both."
      >
        {seatUsage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Seat limits apply only to modules covered by an active subscription, and this organization has none in force.
          </p>
        ) : (
          <div className="space-y-2">
            {seatUsage.map((usage) => {
              const atLimit = usage.limit !== null && usage.used >= usage.limit;
              return (
                <div key={usage.moduleId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <p className="text-sm font-medium">{usage.moduleName}</p>
                  <p className={atLimit ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
                    {usage.limit === null ? `${usage.used} assigned, unlimited` : `${usage.used} of ${usage.limit} seats used`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Billing contact"
        description="Where invoices and payment confirmations for this organization are sent."
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Billing email</dt>
            <dd className="mt-1 font-medium">{organization.billingEmail || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Currency</dt>
            <dd className="mt-1 font-medium">{organization.currency}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Both are edited in Profile and showcase.</p>
      </SectionCard>
    </div>
  );
}
