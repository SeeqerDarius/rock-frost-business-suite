import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchesConversationSearch, filterConversations, groupConversationsByOrganization, type FilterableConversation } from "@/lib/support/conversation-filtering";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

function conversation(overrides: Partial<FilterableConversation> & { id: string }): FilterableConversation {
  return {
    organizationId: "org-1",
    organization: { id: "org-1", name: "Acme Academy", tenantCode: "ACME" },
    user: { id: "user-1", name: "Ama Owusu", email: "ama@example.com" },
    kind: "INDIVIDUAL",
    ...overrides,
  };
}

describe("matchesConversationSearch", () => {
  it("matches on organization name, tenant code, participant name, and participant email, case-insensitively", () => {
    const c = conversation({ id: "c1" });
    expect(matchesConversationSearch(c, "acme")).toBe(true);
    expect(matchesConversationSearch(c, "ACME")).toBe(true);
    expect(matchesConversationSearch(c, "Ama")).toBe(true);
    expect(matchesConversationSearch(c, "ama@example.com")).toBe(true);
    expect(matchesConversationSearch(c, "nonexistent")).toBe(false);
  });

  it("treats an empty or whitespace-only query as matching everything", () => {
    const c = conversation({ id: "c1" });
    expect(matchesConversationSearch(c, "")).toBe(true);
    expect(matchesConversationSearch(c, "   ")).toBe(true);
  });

  it("never throws on a legacy conversation with no user and no organization", () => {
    const legacy = conversation({ id: "c1", user: null, organization: null, kind: "LEGACY" });
    expect(() => matchesConversationSearch(legacy, "anything")).not.toThrow();
    expect(matchesConversationSearch(legacy, "anything")).toBe(false);
    expect(matchesConversationSearch(legacy, "")).toBe(true);
  });
});

describe("filterConversations", () => {
  it("returns only the conversations matching the query", () => {
    const list = [
      conversation({ id: "c1", organization: { id: "org-1", name: "Acme Academy", tenantCode: "ACME" } }),
      conversation({ id: "c2", organizationId: "org-2", organization: { id: "org-2", name: "Zenith Fleet", tenantCode: "ZEN" }, user: { id: "user-2", name: "Kojo Mensah", email: "kojo@example.com" } }),
    ];
    expect(filterConversations(list, "zenith").map((c) => c.id)).toEqual(["c2"]);
    expect(filterConversations(list, "kojo").map((c) => c.id)).toEqual(["c2"]);
    expect(filterConversations(list, "").map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("groupConversationsByOrganization", () => {
  it("groups conversations by organization, preserving each group's first-seen position rather than re-sorting", () => {
    const list = [
      conversation({ id: "c1", organizationId: "org-1", organization: { id: "org-1", name: "Acme Academy", tenantCode: "ACME" } }),
      conversation({ id: "c2", organizationId: "org-2", organization: { id: "org-2", name: "Zenith Fleet", tenantCode: "ZEN" } }),
      conversation({ id: "c3", organizationId: "org-1", organization: { id: "org-1", name: "Acme Academy", tenantCode: "ACME" } }),
    ];

    const groups = groupConversationsByOrganization(list);

    expect(groups.map((g) => g.organizationId)).toEqual(["org-1", "org-2"]);
    expect(groups[0].conversations.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(groups[1].conversations.map((c) => c.id)).toEqual(["c2"]);
  });

  it("falls back to a placeholder name when organization data is missing", () => {
    const groups = groupConversationsByOrganization([conversation({ id: "c1", organization: null })]);
    expect(groups[0].organizationName).toBe("Unknown organization");
  });
});

describe("Support inbox search/grouping — source coverage", () => {
  it("both the platform inbox and the organization admin inbox render through the shared SupportConversationList", () => {
    for (const file of ["src/app/app/platform/support/page.tsx", "src/app/app/(overview)/support/inbox/page.tsx"]) {
      expect(read(file), file).toContain("SupportConversationList");
    }
  });

  it("only the platform inbox groups by organization — the admin inbox is always a single organization", () => {
    expect(read("src/app/app/platform/support/page.tsx")).toContain("groupByOrganization");
    expect(read("src/app/app/(overview)/support/inbox/page.tsx")).not.toContain("groupByOrganization");
  });

  it("the tenant viewer sees a one-line privacy disclosure that platform and admin viewers do not", () => {
    const source = read("src/components/support/support-chat.tsx");
    expect(source).toMatch(/viewerRole === "TENANT"[\s\S]{0,80}Private between you and the Rock Frost team/);
  });
});
