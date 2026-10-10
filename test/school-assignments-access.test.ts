import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolNavigationForTenant } from "@/modules/school/navigation-access";
import { organizationAddon } from "@/platform/organizations/feature-addons";
import { PUBLIC_ADDONS } from "@/lib/pricing-shared";
import type { TenantContext } from "@/lib/tenant";

function tenant(overrides: Partial<TenantContext>): TenantContext {
  return {
    userId: "user-1",
    organizationId: "org-1",
    organization: { id: "org-1", name: "Test School", tenantCode: "TS", industry: null, status: "ACTIVE" },
    role: null,
    roleId: "role-1",
    roleIsSystem: true,
    roleOrganizationId: null,
    permissions: [],
    branch: null,
    enabledModuleKeys: ["school"],
    accessibleModuleKeys: ["school"],
    memberships: [],
    ...overrides,
  } as TenantContext;
}

const read = (path: string) => readFileSync(path, "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe("Assignments & Assessments entitlement and navigation", () => {
  const teacher = tenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_EXAMS_MANAGE] });
  const student = tenant({ role: "Student", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW] });
  const parent = tenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW] });
  // getSchoolNavigationForTenant takes the resolved entitlement feature set
  // rather than a portal boolean (see navigation-access.ts). The assignments
  // add-on is still its own argument because it is priced separately and is
  // not a rung on the plan ladder. Every assertion below is unchanged.
  const hrefs = (t: TenantContext, portal: boolean, assignments: boolean) =>
    getSchoolNavigationForTenant(t, new Set(portal ? ["school.portal"] : []), assignments).map((item) => item.href);

  it("shows teachers Assignments only when the add-on is granted", () => {
    expect(hrefs(teacher, false, true)).toContain("/app/school/assignments");
    expect(hrefs(teacher, false, false)).not.toContain("/app/school/assignments");
  });

  it("hides Assignments from staff without the exam management permission", () => {
    const viewer = tenant({ role: "Librarian", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_LIBRARY_MANAGE] });
    expect(hrefs(viewer, true, true)).not.toContain("/app/school/assignments");
  });

  it("shows students My Assignments only with both the portal and the assignments add-on", () => {
    expect(hrefs(student, true, true)).toContain("/app/school/portal/assignments");
    expect(hrefs(student, true, false)).not.toContain("/app/school/portal/assignments");
    expect(hrefs(student, false, true)).not.toContain("/app/school/portal/assignments");
    expect(hrefs(parent, true, true)).not.toContain("/app/school/portal/assignments");
  });

  it("is a module-scoped School add-on in the operator catalogue", () => {
    const addon = organizationAddon("schoolAssignments");
    expect(addon).toMatchObject({ scope: "module", moduleKeys: ["school"], grantField: "schoolAssignmentsGranted" });
  });

  it("re-checks the grant in the service layer, not just navigation", () => {
    const service = read("src/modules/school/assignments-service.ts");
    const exported = [...service.matchAll(/export async function (\w+)\(organizationId/g)].map((match) => match[1]);
    // Every exported service entry point except the availability probe itself must assert the grant.
    for (const name of exported.filter((fn) => !["isSchoolAssignmentsAvailable", "hasUnpublishedChanges", "listGradebookExamCandidates", "describeGradebookWeight"].includes(fn))) {
      const body = service.slice(service.indexOf(`export async function ${name}(`));
      const nextExport = body.indexOf("\nexport ", 10);
      expect(body.slice(0, nextExport === -1 ? undefined : nextExport), name).toContain("await assertAvailable(organizationId)");
    }
  });

  it("checks permissions in every Server Action before touching the service", () => {
    const actions = read("src/app/app/school/assignments/actions.ts");
    const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((match) => match[1]);
    expect(exported.length).toBeGreaterThan(10);
    for (const name of exported) {
      const body = actions.slice(actions.indexOf(`export async function ${name}(`));
      const end = body.indexOf("\nexport ", 10);
      const fn = body.slice(0, end === -1 ? undefined : end);
      expect(/await (staff|student)\(|await lifecycle\(/.test(fn), name).toBe(true);
    }
    expect(actions).toContain("hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)");
    expect(actions).toContain("isSchoolPortalGranted(tenant.organizationId)");
  });

  it("resolves the submitting student from the session, never from the form", () => {
    const actions = read("src/app/app/school/assignments/actions.ts");
    expect(actions).not.toMatch(/formData\.get\("studentId"\)/);
  });
});

describe("Assignments & Assessments public visibility and SEO", () => {
  it("keeps optional add-on promotion on the School module page, outside the pricing cards", () => {
    const pricing = read("src/app/(public)/pricing/page.tsx");
    const school = read("src/app/(public)/modules/[moduleKey]/page.tsx");
    expect(pricing).toContain(">From <span");
    // The module card now reads the lowest rung of a module's plan ladder
    // where one exists, so that its headline cannot contradict the ladder
    // rendered below it, and falls back to the single module price where
    // there is no ladder. That fallback is what this assertion pins: the
    // card still quotes the module's own price and never an add-on's.
    expect(pricing).toContain("?? price.monthlyGhs");
    expect(pricing).not.toContain("listAddonPrices()");
    expect(pricing).not.toContain("PUBLIC_ADDONS.filter");
    expect(school).toContain("Optional add-on");
    expect(school).toContain("Ask about this add-on");
  });

  it("keeps unconfirmed add-on pricing out of the public pricing page", () => {
    const pricing = read("src/app/(public)/pricing/page.tsx");
    expect(pricing).not.toContain("listAddonPrices()");
    expect(pricing).not.toContain("Priced on request");
    const seed = read("prisma/seed-data.ts");
    expect(seed).not.toContain("addonPricingPlan");
    expect(PUBLIC_ADDONS.map((addon) => addon.key)).toEqual(["schoolAssignments"]);
  });

  it("does not claim AI marking anywhere in the add-on copy", () => {
    const copy = JSON.stringify(PUBLIC_ADDONS) + read("src/lib/seo.ts");
    expect(copy).not.toMatch(/AI[- ]graded|AI marking|marked by AI\b(?! )/i);
    expect(JSON.stringify(PUBLIC_ADDONS)).toContain("never by AI");
  });

  it("keeps authenticated assignment pages out of search", () => {
    expect(read("src/app/robots.ts")).toContain('"/app/"');
    expect(read("src/app/sitemap.ts")).not.toContain("assignments");
  });

  it("uses no em dash in assignment UI, add-on, or pricing copy", () => {
    const files = [
      ...walk("src/app/app/school/assignments"),
      ...walk("src/app/app/school/portal/assignments"),
      ...walk("src/components/school/assignments"),
      "src/modules/school/assignment-grading.ts",
      "src/modules/school/assignments-service.ts",
      "src/app/(public)/pricing/page.tsx",
      "src/lib/pricing-shared.ts",
      "src/lib/seo.ts",
      "src/platform/organizations/feature-addons.ts",
      "src/components/school/form-feedback.tsx",
    ];
    // Developer comments are not customer copy; only check code and strings.
    const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of files) expect(withoutComments(read(file)).includes("—"), file).toBe(false);
  });
});
