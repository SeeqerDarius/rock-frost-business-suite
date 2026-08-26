import type { ModuleNavItem } from "@/types/module";

export type TourStep = {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
};

export type TourDefinition = {
  key: string;
  steps: TourStep[];
};

export const GENERAL_TOUR_KEY = "general";

/**
 * The whole-app orientation tour: hand-authored once, covering only the
 * shared chrome every workspace has (logo, sidebar, module switcher,
 * account menu) rather than any one module's own content.
 */
export function buildGeneralTourSteps(showModuleLauncher: boolean): TourStep[] {
  const steps: TourStep[] = [
    {
      target: '[data-tour="home-logo"]',
      title: "Welcome to Rock Frost",
      content: "This is your workspace. Click the logo any time to come back to your Overview.",
      placement: "right",
    },
    {
      target: '[data-tour="sidebar-nav"]',
      title: "Find your way around",
      content: "Whatever module you are in gets its own menu here, scoped to just that module's own pages.",
      placement: "right",
    },
  ];
  if (showModuleLauncher) {
    steps.push({
      target: '[data-tour="module-switcher"]',
      title: "Switch modules",
      content: "Jump between every module your organization has enabled without going back to Overview first.",
      placement: "bottom",
    });
  }
  steps.push({
    target: '[data-tour="user-menu"]',
    title: "Your account",
    content: "Update your profile, change your password, or sign out from here. You can also replay this tour from this menu at any time.",
    placement: "bottom",
  });
  return steps;
}

/**
 * A module's own tutorial: one step per nav item, so it actually teaches
 * what the module can do rather than just orienting the user to its
 * existence. Entirely derived from data that already exists for every
 * module - the registry's own description, and each nav item's own
 * `description` (src/types/module.ts) - so a new module gets a working,
 * substantive tour the moment it's added to the registry with its
 * navigation array filled in, with no separate content-authoring step.
 *
 * Each per-item step targets that item's own sidebar link
 * (`[data-tour-nav="<href>"]`, stamped by SidebarNav when AppShell passes
 * `tourTargets`) rather than the sidebar as a whole, so the spotlight
 * genuinely highlights the specific page being described. An item with no
 * `description` still gets a step (falling back to its label) rather than
 * being silently skipped, since a missing description is a content gap
 * worth someone noticing, not a reason to under-teach that page.
 */
export function buildModuleTourSteps(sectionLabel: string, description: string | undefined, navigation: ModuleNavItem[]): TourStep[] {
  const steps: TourStep[] = [
    {
      target: '[data-tour="module-title"]',
      title: `Welcome to ${sectionLabel}`,
      content: description ?? `Here is a quick look at what you can do in ${sectionLabel}.`,
      placement: "bottom",
    },
  ];
  for (const item of navigation) {
    steps.push({
      target: `[data-tour-nav="${item.href}"]`,
      title: item.label,
      content: item.description ?? `Go here for ${item.label.toLowerCase()}.`,
      placement: "right",
    });
  }
  return steps;
}
