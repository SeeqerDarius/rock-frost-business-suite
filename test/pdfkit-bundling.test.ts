import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("pdfkit server bundling", () => {
  it("loads pdfkit natively so its font metric files resolve at runtime", () => {
    // Bundled pdfkit resolves data/Helvetica.afm against a placeholder
    // __dirname (/ROOT/...) and every PDF route fails with ENOENT.
    expect(nextConfig.serverExternalPackages).toContain("pdfkit");
  });
});
