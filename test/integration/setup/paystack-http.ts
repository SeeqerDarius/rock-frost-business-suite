import { vi } from "vitest";

/**
 * Mocks Paystack's outbound HTTP facade for the whole integration suite.
 *
 * This lives in `setupFiles` rather than in the one test that needs it
 * because the suite runs with `isolate: false` in a single fork (see
 * vitest.integration.config.ts for why), so every test file shares one
 * module registry. A `vi.mock("@/lib/payments", ...)` declared inside a
 * single test file only wins if that file is the first to pull
 * `@/lib/payments` into the registry. It is not:
 * `settlement-reconciliation-retry.test.ts` imports
 * `@/lib/payments/operational`, which imports the barrel unmocked, so
 * whichever of the two files Vitest happens to order first decides whether
 * the mock applies at all.
 *
 * When it did not apply, the real `paystackRequest()` ran and threw
 * "Paystack is not configured (PAYSTACK_SECRET_KEY unset)". That looked
 * like a missing CI secret, and it is worth being explicit that supplying
 * one would have been the wrong fix: the config check throws *before*
 * `fetch`, so a placeholder key would have sent real requests to
 * api.paystack.co from CI instead of failing. No automated test should
 * reach a third-party API, with or without a usable credential.
 *
 * Only the three account/subaccount calls are replaced. Every Prisma call,
 * status transition, and audit write stays real, which is what makes
 * `settlement-activation-lifecycle.test.ts` a genuine database integration
 * test rather than a fully mocked one.
 */
vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>();
  return {
    ...actual,
    resolvePaystackAccount: vi.fn(async () => ({
      accountName: "Integration Test Org",
      accountNumber: "0000000000",
    })),
    createPaystackSubaccount: vi.fn(async () => ({
      subaccountCode: `ACCT_${Date.now()}`,
      accountName: "Integration Test Org",
      bankName: "Test Bank",
    })),
    updatePaystackSubaccount: vi.fn(async (code: string) => ({
      subaccountCode: code,
      accountName: "Integration Test Org",
      bankName: "Test Bank",
    })),
  };
});
