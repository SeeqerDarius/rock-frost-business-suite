import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public subscription and support entry points", () => {
  it("offers direct module and suite subscriptions without a demo approval step", () => {
    const pricing = readFileSync("src/app/(public)/pricing/page.tsx", "utf8");
    const subscribe = readFileSync("src/app/(public)/subscribe/page.tsx", "utf8");
    expect(pricing).toContain("Subscribe to this module");
    expect(pricing).toContain("Subscribe to this suite");
    expect(subscribe).toContain("No platform-owner approval is required");
  });

  it("keeps the public support entry point available on the contact page", () => {
    const layout = readFileSync("src/app/(public)/layout.tsx", "utf8");
    const contact = readFileSync("src/app/(public)/contact/page.tsx", "utf8");
    expect(layout).toContain("PublicSupportFloat");
    expect(contact).toContain("Open customer support");
    expect(contact).toContain("platform operator is online");
  });
});
