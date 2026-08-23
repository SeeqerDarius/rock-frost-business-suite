import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journalPage = readFileSync("src/app/app/accounting/journal/page.tsx", "utf8");
const journalService = readFileSync("src/modules/accounting/service.ts", "utf8");
const insightsPage = readFileSync("src/app/app/accounting/insights/page.tsx", "utf8");
const insightsAction = readFileSync("src/app/app/accounting/insights/actions.ts", "utf8");
const insightsAssistant = readFileSync("src/app/app/accounting/insights/insight-assistant.tsx", "utf8");
const navigation = readFileSync("src/modules/accounting/navigation.tsx", "utf8");

describe("Accounting journal integrity and insights surface", () => {
  it("offers journal reversal only for manual entries and enforces the same rule in the service", () => {
    expect(journalPage).toContain('entry.sourceType === "MANUAL"');
    expect(journalPage).toContain("Managed by its source workflow");
    expect(journalService).toContain('original.sourceType !== "MANUAL"');
    expect(journalService).toContain("expectedSource");
  });

  it("exposes tenant-scoped accounting insights with permission-checked assistant access", () => {
    expect(navigation).toContain('/app/accounting/insights');
    expect(insightsPage).toContain("Revenue by source");
    expect(insightsPage).toContain("Items requiring attention");
    expect(insightsAction).toContain('requireModuleAccess("accounting")');
    expect(insightsAction).toContain("ACCOUNTING_REPORTS_VIEW");
    expect(insightsAction).toContain("AI_ASSISTANT_USE");
  });

  it("clears submitted questions immediately and exposes a visible pending response state", () => {
    expect(insightsAssistant).toContain('setQuestion("")');
    expect(insightsAssistant).toContain("setSubmittedQuestion(submitted)");
    expect(insightsAssistant).toContain("Reviewing the selected period...");
    expect(insightsAssistant).toContain("LoaderCircle");
    expect(insightsAssistant).toContain("inputRef.current?.focus()");
  });

  it("brands the assistant and uses the signed-in user's uploaded profile image", () => {
    expect(insightsPage).toContain("userImage={user?.image ?? null}");
    expect(insightsAssistant).toContain("Rock Frost Business Assistant");
    expect(insightsAssistant).toContain('/rf-business-assistant.png');
    expect(insightsAssistant).toContain('src={userImage}');
    expect(insightsAssistant).toContain('/icon-192.png');
  });
});
