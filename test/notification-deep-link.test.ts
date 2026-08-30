import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getNotificationHref } from "@/lib/notifications/deep-link";

const page = fs.readFileSync("src/app/app/(overview)/notifications/page.tsx", "utf8");
const sidebarNav = fs.readFileSync("src/components/navigation/sidebar-nav.tsx", "utf8");
const badge = fs.readFileSync("src/components/notifications/notification-badge.tsx", "utf8");

describe("getNotificationHref", () => {
  it("routes a Vehicle Owner to their own per-vehicle page when a vehicleId is known", () => {
    expect(getNotificationHref({ type: "FLEET_DOCUMENT_RENEWAL", metadata: { vehicleId: "vehicle-1" } }, true)).toBe(
      "/app/fleet/investor/vehicles/vehicle-1",
    );
    expect(
      getNotificationHref({ type: "FLEET_MAINTENANCE_COMPLETED", metadata: { vehicleId: "vehicle-1" } }, true),
    ).toBe("/app/fleet/investor/vehicles/vehicle-1");
  });

  it("routes every other role to the flat management list for the same notification types", () => {
    expect(getNotificationHref({ type: "FLEET_DOCUMENT_RENEWAL", metadata: { vehicleId: "vehicle-1" } }, false)).toBe(
      "/app/fleet/insurance-roadworthy",
    );
    expect(
      getNotificationHref({ type: "FLEET_MAINTENANCE_SUBMITTED", metadata: { vehicleId: "vehicle-1" } }, false),
    ).toBe("/app/fleet/maintenance");
  });

  it("routes driver payment notifications to the driver portal regardless of vehicleId", () => {
    expect(getNotificationHref({ type: "FLEET_DRIVER_PAYMENT_APPROVED", metadata: { vehicleId: "vehicle-1" } }, false)).toBe(
      "/app/fleet/driver-portal",
    );
  });

  it("falls back to the flat list for an owner when no vehicleId is present", () => {
    expect(getNotificationHref({ type: "FLEET_DOCUMENT_RENEWAL", metadata: {} }, true)).toBe("/app/fleet/insurance-roadworthy");
  });

  it("maps non-fleet notification types to their own destinations", () => {
    expect(getNotificationHref({ type: "MODULE_REQUEST_UPDATE", metadata: null }, false)).toBe("/app/module-requests");
    expect(getNotificationHref({ type: "SUBSCRIPTION_ACTIVATED", metadata: null }, false)).toBe("/app/organization/billing");
    expect(getNotificationHref({ type: "TRIAL_EXPIRED", metadata: null }, false)).toBe("/app/organization/billing");
  });

  it("returns null for an unknown type instead of guessing a destination", () => {
    expect(getNotificationHref({ type: "SOMETHING_NEW", metadata: null }, false)).toBeNull();
  });
});

describe("Notification pagination and badge wiring", () => {
  it("widens the page window from a fixed start instead of a carried-forward cursor, so Load more can't duplicate or skip", () => {
    expect(page).toContain("orderBy: [{ createdAt: \"desc\" }, { id: \"desc\" }]");
    expect(page).toContain("take: take + 1");
    expect(page).toContain("const hasMore = rawNotifications.length > take;");
    expect(page).toContain("loadMoreHref = `?${unreadOnly ? \"unread=1&\" : \"\"}take=${take + PAGE_SIZE}`");
  });

  it("supports an Unread only toggle via a query param", () => {
    expect(page).toContain('unreadOnly = query.unread === "1"');
    expect(page).toContain("...(unreadOnly ? { readAt: null } : {})");
  });

  it("mounts the unread badge only on the Notifications sidebar item", () => {
    expect(sidebarNav).toContain('item.href === "/app/notifications" ? <NotificationBadge /> : null');
  });

  it("badge polls its own count and respects tab visibility, mirroring the support widget's pattern", () => {
    expect(badge).toContain("getNotificationUnreadCount");
    expect(badge).toContain('document.visibilityState !== "visible"');
    expect(badge).toContain("visibilitychange");
  });
});
