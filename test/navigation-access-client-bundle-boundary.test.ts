import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fleet and Installment keep their tenant-aware, permission-checking page
 * filter in a dedicated navigation-access.ts file, separate from their
 * plain navigation.tsx array. registry.ts imports navigation.tsx for every
 * module (for the catalogue/launcher), and AppShell (a Client Component)
 * imports registry.ts - so anything navigation.tsx imports ends up in the
 * client bundle. @/lib/auth/permissions starts with `import "server-only"`,
 * so putting a permission-checking function directly in navigation.tsx
 * would poison AppShell's client bundle with a server-only dependency -
 * confirmed by a real Turbopack build failure when this was tried directly.
 * This boundary predates and outlives any particular sidebar rendering
 * style, so it's tested on its own rather than folded into a sidebar test.
 */
describe("navigation.tsx files stay free of @/lib/auth/permissions (registry.ts's client-bundle boundary)", () => {
  it("Fleet and Installment's plain navigation arrays never import permissions.ts", () => {
    const fleetNav = readFileSync("src/modules/fleet/navigation.tsx", "utf8");
    const installmentNav = readFileSync("src/modules/installment/navigation.tsx", "utf8");
    expect(fleetNav).not.toContain("@/lib/auth/permissions");
    expect(installmentNav).not.toContain("@/lib/auth/permissions");
  });

  it("the dedicated navigation-access files do import permissions.ts, and are never imported by registry.ts", () => {
    const registry = readFileSync("src/platform/modules/registry.ts", "utf8");
    const fleetAccess = readFileSync("src/modules/fleet/navigation-access.ts", "utf8");
    const installmentAccess = readFileSync("src/modules/installment/navigation-access.ts", "utf8");
    expect(fleetAccess).toContain("@/lib/auth/permissions");
    expect(installmentAccess).toContain("@/lib/auth/permissions");
    expect(registry).not.toContain("navigation-access");
  });
});
