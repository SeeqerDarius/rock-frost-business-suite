import { describe, expect, it } from "vitest";
import { PUBLIC_SHOWCASE_FILTER, readPublicShowcase } from "../src/lib/public-showcase";

describe("public customer showcase", () => {
  it("defaults to private when explicit approval metadata is absent", () => {
    expect(readPublicShowcase(null)).toEqual({ enabled: false, quote: "", attribution: "" });
    expect(readPublicShowcase({ workspaceSettings: {} }).enabled).toBe(false);
  });

  it("reads only the bounded approved showcase fields", () => {
    expect(readPublicShowcase({
      publicShowcase: { enabled: true, quote: "A better way to work.", attribution: "Operations team" },
    })).toEqual({ enabled: true, quote: "A better way to work.", attribution: "Operations team" });
  });

  it("requires active status, a logo, and explicit enabled metadata in the public query", () => {
    expect(PUBLIC_SHOWCASE_FILTER).toEqual({
      status: "ACTIVE",
      logoUrl: { not: null },
      metadata: { path: ["publicShowcase", "enabled"], equals: true },
    });
  });
});
