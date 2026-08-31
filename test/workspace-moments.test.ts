import { describe, expect, it } from "vitest";
import { greetingForHour, hourInTimezone, safeFirstName, shouldShowMotivation, workspaceGreeting, MOTIVATION_INTERVAL_MS } from "@/lib/workspace-moments";

describe("workspace greetings", () => {
  it("uses the defined morning, afternoon and evening boundaries", () => {
    expect(greetingForHour(5)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(16)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good evening");
    expect(greetingForHour(4)).toBe("Good evening");
  });

  it("uses the organization timezone and safely falls back to Accra", () => {
    const instant = new Date("2026-08-31T13:00:00Z");
    expect(hourInTimezone(instant, "Africa/Accra")).toBe(13);
    expect(hourInTimezone(instant, "not/a-zone")).toBe(13);
    expect(workspaceGreeting(instant, "Africa/Accra", "Ama", null)).toBe("Good afternoon, Ama");
  });

  it("falls back to a neutral greeting for unsafe or missing names", () => {
    expect(safeFirstName(null, "<script>alert(1)</script>")).toBeNull();
    expect(workspaceGreeting(new Date("2026-08-31T08:00:00Z"), "Africa/Accra", null, null)).toBe("Good morning");
  });
});

describe("motivation frequency", () => {
  it("shows initially and only again after the frequency window", () => {
    const now = Date.now();
    expect(shouldShowMotivation(null, now)).toBe(true);
    expect(shouldShowMotivation(now - MOTIVATION_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldShowMotivation(now - MOTIVATION_INTERVAL_MS, now)).toBe(true);
  });
});
