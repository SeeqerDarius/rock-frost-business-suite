import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/icons/animated-activity-icon.tsx"), "utf8");
const platformNavigation = fs.readFileSync(path.join(root, "src/platform/modules/platform-navigation.tsx"), "utf8");

describe("animated activity icon", () => {
  it("uses path drawing motion with the shared imperative animation contract", () => {
    expect(component).toContain('from "motion/react"');
    expect(component).toContain("pathLength: [0, 1]");
    expect(component).toContain("pathOffset: [1, 0]");
    expect(component).toContain('startAnimation: () => controls.start("animate")');
    expect(component).toContain('stopAnimation: () => controls.start("normal")');
  });

  it("is used for the platform System Activity navigation item", () => {
    expect(platformNavigation).toContain('import { AnimatedActivityIcon }');
    expect(platformNavigation).toContain('label: "System Activity"');
    expect(platformNavigation).toContain("icon: <AnimatedActivityIcon size={16} />");
  });
});
