import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getLocalizationSettings } from "@/modules/globalization/organization-localization";
import { LocalizationForm } from "./localization-form";

export const metadata = { title: "Localization settings" };

export default async function LocalizationSettingsPage() {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return <EmptyState icon={Lock} title="Access denied" description="Only organization administrators can manage localization settings." />;
  }
  const { organization, countryCode, history } = await getLocalizationSettings(tenant.organizationId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/app/organization/settings" className="hover:text-foreground">Workspace settings</Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">Localization</span>
      </nav>
      <PageHeader
        title="Organization and localization"
        description="Legal identity, country, base currency, timezone, and formatting for this organization. Country selection suggests defaults; every permitted value can be reviewed and overridden."
      />
      <LocalizationForm
        initial={{
          legalName: organization.legalName ?? organization.name,
          tradingName: organization.tradingName ?? "",
          country: countryCode ?? "",
          region: organization.region ?? "",
          city: organization.city ?? "",
          address: organization.address ?? "",
          postalCode: organization.postalCode ?? "",
          legalEntityType: organization.legalEntityType ?? "",
          taxNumber: organization.taxNumber ?? "",
          vatRegistrationNumber: organization.vatRegistrationNumber ?? "",
          businessRegistrationNumber: organization.businessRegistrationNumber ?? "",
          currency: organization.currency,
          fiscalYearStartMonth: organization.fiscalYearStartMonth,
          accountingBasis: organization.accountingBasis,
          timezone: organization.timezone,
          locale: organization.locale ?? "",
          dateFormat: organization.dateFormat,
          numberFormat: organization.numberFormat,
          defaultLanguage: organization.defaultLanguage,
          pricesIncludeTax: organization.pricesIncludeTax,
          jurisdictionCode: organization.jurisdictionCode ?? "",
        }}
        baseCurrencyLocked={history.hasAccountingHistory}
        accountingCounts={{ journalEntries: history.journalEntries, invoices: history.invoices, bills: history.bills }}
        hasTaxHistory={history.hasTaxHistory}
      />
    </div>
  );
}
