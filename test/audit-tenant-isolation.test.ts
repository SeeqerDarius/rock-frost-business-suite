import { describe, expect, it } from "vitest";
import { tenantAuditWhere } from "@/lib/audit-scope";

describe("tenant audit-log isolation", () => {
  it("requires the active tenant and excludes every global platform actor", () => {
    expect(tenantAuditWhere("tenant-1")).toEqual({
      organizationId: "tenant-1",
      OR: [
        { userId: null },
        {
          user: {
            is: {
              organizationMemberships: {
                none: {
                  role: {
                    name: "Super Admin",
                    isSystem: true,
                    organizationId: null,
                  },
                },
              },
            },
          },
        },
      ],
    });
  });
});
