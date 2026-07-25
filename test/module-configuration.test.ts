import { describe, expect, it } from "vitest";
import {
  parseConfigurationJson,
  parseOrganizationModuleConfiguration,
} from "@/platform/module-requests/configuration";

describe("organization module configuration", () => {
  it("accepts the supported versioned configuration structure", () => {
    const result = parseConfigurationJson(JSON.stringify({
      version: 1,
      features: { ownerApproval: true },
      limits: { approvalThreshold: 10000 },
      workflow: { purchaseOrders: "two-step" },
      terminology: { warehouse: "Depot" },
      extensions: ["ghana-payroll"],
    }));
    expect(result.success).toBe(true);
  });

  it("rejects arbitrary nested values and negative limits", () => {
    const result = parseConfigurationJson(JSON.stringify({
      version: 1,
      features: { ownerApproval: "yes" },
      limits: { approvalThreshold: -1 },
    }));
    expect(result.success).toBe(false);
  });

  it("fails safely to an empty configuration when legacy JSON is invalid", () => {
    expect(parseOrganizationModuleConfiguration({ features: { broken: "yes" } })).toEqual({
      version: 1,
      features: {},
      limits: {},
      workflow: {},
      terminology: {},
      extensions: [],
    });
  });
});

