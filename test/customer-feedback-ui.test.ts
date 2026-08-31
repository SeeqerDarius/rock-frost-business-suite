import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { plainFeedbackText } from "@/lib/customer-feedback";

const read = (path: string) => readFileSync(path, "utf8");

describe("customer feedback", () => {
  it("stores feedback as plain bounded text", () => {
    expect(plainFeedbackText(" <script>alert(1)</script> Useful   product ", 50)).toBe("alert(1) Useful product");
    expect(plainFeedbackText("abcdef", 3)).toBe("abc");
  });

  it("requires explicit testimonial consent and moderation before public reads", () => {
    const service = read("src/lib/customer-feedback.ts");
    expect(service).toContain('input.category === "TESTIMONIAL" && input.consentToPublish');
    expect(service).toContain('status: "PUBLISHED", category: "TESTIMONIAL", consentToPublish: true');
    expect(service).toContain('current.category !== "TESTIMONIAL" || !current.consentToPublish');
  });

  it("scopes submitter reads and withdrawals to organization and user", () => {
    const service = read("src/lib/customer-feedback.ts");
    expect(service).toContain("where: { organizationId, userId }");
    expect(service).toContain("where: { id: feedbackId, organizationId, userId }");
  });

  it("redirects anonymous page renders instead of throwing a tenant error", () => {
    const page = read("src/app/app/(overview)/feedback/page.tsx");
    expect(page).toContain("getCurrentTenant()");
    expect(page).toContain('if (!tenant) redirect("/login")');
    expect(page).not.toContain("requireCurrentTenant()");
  });

  it("provides accessible, non-blocking feedback and motivation UI", () => {
    const moments = read("src/components/feedback/workspace-moments.tsx");
    expect(moments).toContain('aria-live="polite"');
    expect(moments).toContain("motion-safe:animate-in");
    expect(moments).toContain("window.localStorage");
    expect(moments).toContain("/app/organization/billing");
    expect(moments).toContain('aria-label="Dismiss motivation"');
  });
});
