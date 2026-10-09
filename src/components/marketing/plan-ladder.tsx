import Link from "next/link";
import { Check, Infinity as InfinityIcon, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatGhs, type ModuleLadder } from "@/lib/pricing-shared";
import { featuresAddedAt, limitsAt, moduleTierCatalogue } from "@/platform/entitlements/catalogue";
import { PLAN_TIER_LABELS, PLAN_TIER_TAGLINES, QUOTE_ONLY_TIERS, type PlanTier } from "@/platform/entitlements/tiers";

/**
 * One module's plan ladder, rendered straight from the entitlement
 * catalogue and the module's price rows.
 *
 * Nothing here is a hand-written list of what each plan includes, and that
 * is the point. The catalogue in src/platform/entitlements/catalogue.ts is
 * what the server actually enforces, so generating the columns from it means
 * the page cannot promise a feature the gate withholds, or stay quiet about
 * one that was added. A price list that drifts from the gate is a refund
 * request.
 *
 * Only modules with a published, enforced ladder are passed in. See
 * listModuleLadders() in src/lib/pricing.ts.
 */

/** The recommended rung, highlighted so the page gives an actual answer. */
const RECOMMENDED_TIER: PlanTier = "PRO";

function limitLine(moduleKey: string, tier: PlanTier) {
  const catalogue = moduleTierCatalogue(moduleKey);
  const ceilings = limitsAt(moduleKey, tier);
  return catalogue.limits.map((limit) => {
    const ceiling = ceilings[limit.key];
    return {
      key: limit.key,
      unlimited: ceiling === null,
      text: ceiling === null
        ? `Unlimited ${limit.unitPlural ?? `${limit.unit}s`}`
        : `Up to ${ceiling.toLocaleString("en-GH")} ${ceiling === 1 ? limit.unit : (limit.unitPlural ?? `${limit.unit}s`)}`,
    };
  });
}

export function PlanLadder({ ladder, moduleName }: { ladder: ModuleLadder; moduleName: string }) {
  // Derived, not listed: if a tier stops being quote-only it gains a price
  // column here and a checkout button, with nothing to remember.
  const quoteOnlyTiers = QUOTE_ONLY_TIERS;
  const columns = ladder.rungs.length + quoteOnlyTiers.length;
  return (
    <div id={`${ladder.moduleKey}-plans`} className="scroll-mt-24">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold">{moduleName} plans</h2>
        <p className="mt-2 text-muted-foreground">
          Every plan is the same {moduleName} workspace with the same security, backups and support. Moving up a plan adds
          capability and raises the ceilings. You can move up at any time, and what you have already recorded stays where it is.
        </p>
      </div>
      <div className={columns >= 4 ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4" : "grid gap-4 md:grid-cols-3"}>
        {ladder.rungs.map((rung, index) => {
          const added = featuresAddedAt(ladder.moduleKey, rung.tier);
          const below = index > 0 ? ladder.rungs[index - 1] : null;
          const recommended = rung.tier === RECOMMENDED_TIER;
          return (
            <Card key={rung.tier} className={recommended ? "flex flex-col border-primary shadow-sm" : "flex flex-col"}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{PLAN_TIER_LABELS[rung.tier]}</CardTitle>
                  {recommended ? <Badge>Most chosen</Badge> : null}
                </div>
                <CardDescription className="space-y-2">
                  <span className="block">{PLAN_TIER_TAGLINES[rung.tier]}</span>
                  <span className="block">
                    <span className="text-2xl font-semibold text-foreground">{formatGhs(rung.monthlyGhs)}</span> / month
                  </span>
                  <span className="block text-xs">{formatGhs(rung.annualGhs)} billed annually</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-4">
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Users className="size-4 shrink-0 text-primary" />
                    {rung.includedSeats} staff seats included
                  </p>
                  {limitLine(ladder.moduleKey, rung.tier).map((limit) => (
                    <p key={limit.key} className="flex items-center gap-2">
                      {limit.unlimited
                        ? <InfinityIcon className="size-4 shrink-0 text-primary" />
                        : <Check className="size-4 shrink-0 text-primary" />}
                      {limit.text}
                    </p>
                  ))}
                </div>
                <div className="space-y-2 border-t pt-4 text-sm">
                  <p className="font-medium">
                    {below ? `Everything in ${PLAN_TIER_LABELS[below.tier]}, plus:` : "Includes:"}
                  </p>
                  <ul className="space-y-2">
                    {added.map((feature) => (
                      <li key={feature.key} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>
                          <span className="font-medium">{feature.name}.</span> {feature.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className="w-full"
                  variant={recommended ? "default" : "outline"}
                  nativeButton={false}
                  render={<Link href={`/subscribe?type=module&product=${ladder.moduleKey}&tier=${rung.tier}`} />}
                >
                  Start on {PLAN_TIER_LABELS[rung.tier]}
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {quoteOnlyTiers.map((tier) => {
          const top = ladder.rungs[ladder.rungs.length - 1];
          return (
            <Card key={tier} className="flex flex-col border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>{PLAN_TIER_LABELS[tier]}</CardTitle>
                <CardDescription className="space-y-2">
                  <span className="block">{PLAN_TIER_TAGLINES[tier]}</span>
                  <span className="block text-2xl font-semibold text-foreground">Priced to your agreement</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-4">
                <div className="space-y-2 border-t pt-4 text-sm">
                  <p className="font-medium">
                    {top ? `Everything in ${PLAN_TIER_LABELS[top.tier]}, plus:` : "Includes:"}
                  </p>
                  <ul className="space-y-2">
                    {[
                      "Seats, campuses and data volumes written into your contract.",
                      "Onboarding, data migration from your current records, and staff training.",
                      "Named support contact, agreed response times, and a documented escalation path.",
                      "Integrations with the systems you already run, scoped with our team.",
                    ].map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className="w-full"
                  nativeButton={false}
                  render={<Link href={`/contact?intent=module&module=${ladder.moduleKey}`} />}
                >
                  Talk to Rock Frost
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
