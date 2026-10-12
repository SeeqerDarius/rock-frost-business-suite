import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateSubscriptionTierAction } from "../../../subscriptions/actions";
import {
  featuresIncludedAt,
  limitsAt,
  moduleTierCatalogue,
} from "@/platform/entitlements/catalogue";
import { PLAN_TIERS, PLAN_TIER_LABELS, isQuoteOnlyTier, type PlanTier } from "@/platform/entitlements/tiers";

/**
 * The operator's tier control for one module subscription.
 *
 * Deliberately shows what each rung actually contains rather than four bare
 * names: an operator moving a customer between plans is making a decision
 * about that customer's access, and "Pro" on its own does not say what is
 * being given or taken. Each option lists the features it adds over the tier
 * below it and any ceiling that changes.
 *
 * A downgrade the organization's usage already exceeds is refused by
 * updateSubscriptionTier() rather than silently applied, so this renders
 * every option and lets the server be the authority. Disabling the option
 * here instead would need this component to count live usage per tier, which
 * is a second implementation of the same rule and the sort of duplication
 * that drifts.
 */
export function TierSelector({
  subscriptionId,
  moduleKey,
  currentTier,
  returnTo,
}: {
  subscriptionId: string;
  moduleKey: string;
  currentTier: PlanTier;
  returnTo: string;
}) {
  const catalogue = moduleTierCatalogue(moduleKey);

  if (catalogue.tieringPending) {
    return (
      <div className="rounded-md bg-muted/40 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan tier</p>
        <p className="mt-1 text-sm">
          {PLAN_TIER_LABELS[currentTier]}, recorded on the agreement but not yet enforced for this module.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This module has no tier ladder defined yet, so every tier grants the same access. Changing it here only
          changes what the agreement says.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan tier</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PLAN_TIERS.map((tier) => {
          const current = tier === currentTier;
          const added = featuresAddedAt(moduleKey, tier);
          const ceilings = changedCeilingsAt(moduleKey, tier);
          return (
            <form key={tier} action={updateSubscriptionTierAction} className="rounded-lg border p-3">
              <input type="hidden" name="subscriptionId" value={subscriptionId} />
              <input type="hidden" name="tier" value={tier} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{PLAN_TIER_LABELS[tier]}</p>
                    {current ? <Badge variant="secondary">Current</Badge> : null}
                    {isQuoteOnlyTier(tier) ? <Badge variant="outline">By quote</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {added.length > 0 ? `Adds ${added.join(" · ")}` : "Everything in the tier below."}
                  </p>
                  {ceilings.length > 0 ? (
                    <p className="text-xs text-muted-foreground">{ceilings.join(" · ")}</p>
                  ) : null}
                </div>
                <Button type="submit" size="sm" variant={current ? "default" : "outline"} disabled={current}>
                  {current ? "Current" : "Switch"}
                </Button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Feature names this tier adds over the one below it, kept exactly as the
 * catalogue spells them. An earlier version lowercased them to read as prose
 * and turned "SMS notifications" into "sms notifications", so they are joined
 * with a separator instead of being forced into a sentence.
 */
function featuresAddedAt(moduleKey: string, tier: PlanTier): string[] {
  const index = PLAN_TIERS.indexOf(tier);
  const below = index > 0 ? new Set(featuresIncludedAt(moduleKey, PLAN_TIERS[index - 1])) : new Set<string>();
  return moduleTierCatalogue(moduleKey)
    .features.filter((feature) => feature.minTier === tier && !below.has(feature.key))
    .map((feature) => feature.name);
}

/** Ceilings that differ from the tier below, rendered as "Students: 1,500". */
function changedCeilingsAt(moduleKey: string, tier: PlanTier): string[] {
  const index = PLAN_TIERS.indexOf(tier);
  const below = index > 0 ? limitsAt(moduleKey, PLAN_TIERS[index - 1]) : null;
  const here = limitsAt(moduleKey, tier);
  return moduleTierCatalogue(moduleKey).limits.flatMap((limit) => {
    const ceiling = here[limit.key];
    if (below && below[limit.key] === ceiling) return [];
    return [`${limit.name}: ${ceiling === null ? "unlimited" : ceiling.toLocaleString("en-GH")}`];
  });
}
