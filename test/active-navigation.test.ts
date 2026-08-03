import { describe, expect, it } from "vitest";
import { getActiveNavigationHref } from "@/components/navigation/active-navigation";

const hotelItems = [
  { href: "/app/hotel" },
  { href: "/app/hotel/rooms" },
  { href: "/app/hotel/reservations" },
];

describe("active navigation matching", () => {
  it("selects only the most-specific nested route", () => {
    expect(getActiveNavigationHref("/app/hotel/rooms", hotelItems)).toBe("/app/hotel/rooms");
    expect(getActiveNavigationHref("/app/hotel/rooms/room-1", hotelItems)).toBe("/app/hotel/rooms");
  });

  it("selects the overview only on its exact route", () => {
    expect(getActiveNavigationHref("/app/hotel", hotelItems)).toBe("/app/hotel");
  });

  it("does not match a false string prefix", () => {
    expect(getActiveNavigationHref("/app/hotelier", hotelItems)).toBeUndefined();
  });

  it("resolves organization billing without also selecting organization", () => {
    const items = [{ href: "/app/organization" }, { href: "/app/organization/billing" }];
    expect(getActiveNavigationHref("/app/organization/billing", items)).toBe("/app/organization/billing");
  });
});
