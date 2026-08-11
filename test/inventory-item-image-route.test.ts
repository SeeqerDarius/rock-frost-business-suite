import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const action = readFileSync("src/app/app/inventory/items/actions.ts", "utf8");
const route = readFileSync("src/app/api/inventory/items/[itemId]/image/route.ts", "utf8");
const page = readFileSync("src/app/app/inventory/items/page.tsx", "utf8");

describe("inventory item image surface", () => {
  it("validates uploads and supports explicit removal", () => {
    expect(action).toContain("inventoryItemImageData");
    expect(action).toContain('formData.get("removeImage")');
    expect(page).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(page).toContain("Remove current image");
  });

  it("serves images only through an authenticated, tenant-scoped module route", () => {
    expect(route).toContain("getCurrentTenant");
    expect(route).toContain('canAccessModule(tenant, "inventory")');
    expect(route).toContain("getItemImage(tenant.organizationId, itemId)");
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
  });
});
