import { describe, expect, it } from "vitest";
import { getRoleQuickGuide } from "@/lib/auth/role-quick-guide";

describe("role quick guide", () => {
  it("gives school admissions staff an explicit workflow", () => {
    const guide = getRoleQuickGuide("Admissions Officer", ["school"]);
    expect(guide.summary).toContain("student admissions");
    expect(guide.steps.join(" ")).toContain("Admit student");
    expect(guide.steps.join(" ")).toContain("Classes & Enrollment");
  });

  it("explains access safely for a custom role", () => {
    const guide = getRoleQuickGuide("Custom Reviewer", ["school", "accounting"]);
    expect(guide.summary).toContain("school, accounting");
    expect(guide.steps.join(" ")).toContain("organization administrator");
  });
});
