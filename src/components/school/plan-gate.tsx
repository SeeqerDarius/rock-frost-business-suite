import "server-only";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { featureDefinition } from "@/platform/entitlements/catalogue";
import { PLAN_TIER_LABELS } from "@/platform/entitlements/tiers";
import { hasModuleFeature } from "@/platform/entitlements/resolve";

/**
 * The server-side half of plan gating for a School page.
 *
 * Navigation already hides a page the organization's plan does not include
 * (src/modules/school/navigation-access.ts), but hiding a link is a
 * convenience, not a boundary: anyone can type the URL. Every plan-gated
 * page therefore calls this and returns its result when it is not null,
 * exactly as the portal pages already do for their own entitlement.
 *
 * The copy is generated from the catalogue rather than written per page, so
 * the feature's name and the tier it needs can never drift from what the
 * pricing page and the operator's tier selector say.
 */
export async function schoolPlanGate(
  organizationId: string,
  featureKey: string,
  pageTitle: string,
  pageDescription: string,
): Promise<React.ReactElement | null> {
  if (await hasModuleFeature(organizationId, featureKey)) return null;

  const feature = featureDefinition(featureKey);
  const requiredTier = feature ? PLAN_TIER_LABELS[feature.minTier] : null;

  return (
    <div className="mx-auto max-w-screen-lg space-y-6">
      <PageHeader title={pageTitle} description={pageDescription} />
      <EmptyState
        icon={ShieldOff}
        title={`${feature?.name ?? pageTitle} is not part of your plan`}
        description={
          requiredTier
            ? `${feature?.summary ?? ""} It is included from the ${requiredTier} plan upwards. Your organization's administrator can ask Rock Frost to upgrade School Management.`
            : "Your organization's administrator can ask Rock Frost to enable this."
        }
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/app/school" />}>
            Back to School Overview
          </Button>
        }
      />
    </div>
  );
}
