import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/icons/animated-settings-icon.tsx"), "utf8");

describe("AnimatedSettingsIcon", () => {
  it("uses a slow spring and rotates the gear through a complete half turn", () => {
    expect(component).toContain('from "motion/react"');
    expect(component).toContain('stiffness: 38, damping: 12, mass: 1.15');
    expect(component).toContain('animate: { rotate: 180 }');
  });

  it("supports both hover playback and imperative parent control", () => {
    expect(component).toContain('startAnimation: () => controls.start("animate")');
    expect(component).toContain('if (!isControlledRef.current) void controls.start("animate")');
    expect(component).toContain('if (!isControlledRef.current) void controls.start("normal")');
    expect(component).toContain("useAnimatedIconHover()");
    expect(component).toContain('controls.start(parentHovered ? "animate" : "normal")');
  });
});
