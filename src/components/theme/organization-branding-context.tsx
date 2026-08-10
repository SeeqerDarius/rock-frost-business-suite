"use client";

import { createContext, useContext } from "react";

export interface OrganizationBranding {
  logoUrl: string | null;
  name: string | null;
}

const OrganizationBrandingContext = createContext<OrganizationBranding>({ logoUrl: null, name: null });

/**
 * Makes the current organization's uploaded logo (Organization Settings >
 * Company logo) available to `AppShell` without prop-drilling it through
 * every module's own `layout.tsx` — `src/app/app/layout.tsx` is the one
 * layout every authenticated route (every module, organization scope, and
 * platform scope) already renders under, and is where this is populated
 * once per request.
 */
export function OrganizationBrandingProvider({ branding, children }: { branding: OrganizationBranding; children: React.ReactNode }) {
  return <OrganizationBrandingContext.Provider value={branding}>{children}</OrganizationBrandingContext.Provider>;
}

export function useOrganizationBranding() {
  return useContext(OrganizationBrandingContext);
}
