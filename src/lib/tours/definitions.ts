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
 * A module's own short intro, derived from data that already exists for
 * every module (its registry description and its own navigation list)
 * rather than hand-written content per module - so a new module gets a
 * working tour the moment it is added to the registry, with no extra
 * content-authoring step required.
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
  if (navigation.length > 0) {
    steps.push({
      target: '[data-tour="sidebar-nav"]',
      title: "What's in this menu",
      content: `${sectionLabel} is organized into: ${navigation.map((item) => item.label).join(", ")}.`,
      placement: "right",
    });
  }
  return steps;
}
