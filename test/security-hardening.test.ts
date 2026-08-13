import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

describe("security hardening", () => {
  it("sets comprehensive browser security headers", async () => {
    const config = await read("next.config.ts");
    for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options"]) expect(config).toContain(header);
    expect(config).toContain("frame-ancestors 'none'");
  });

  it("runs dependency and Git-history secret scanning in CI", async () => {
    const ci = await read(".github/workflows/ci.yml");
    expect(ci).toContain("npm audit --audit-level=high");
    expect(ci).toContain("gitleaks/gitleaks-action@v2");
    expect(ci).toContain("fetch-depth: 0");
  });

  it("protects public contact and authentication forms with Turnstile", async () => {
    const [contactAction, loginPage, resetPage] = await Promise.all(["src/app/(public)/contact/actions.ts", "src/app/(auth)/login/page.tsx", "src/app/(auth)/forgot-password/page.tsx"].map(read));
    expect(contactAction).toContain("verifyBotProtection");
    expect(loginPage).toContain("TurnstileWidget");
    expect(resetPage).toContain("TurnstileWidget");
  });
});
