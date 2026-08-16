import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("platform request inbox", () => {
  it("shows every new public contact intent", async () => {
    const page = await readFile(
      path.join(process.cwd(), "src/app/app/platform/requests/page.tsx"),
      "utf8",
    );

    expect(page).toContain('where: { status: "NEW" }');
    expect(page).not.toContain('intent: { in: ["DEMO", "MODULE", "CUSTOM_MODULE"] }');
    for (const intent of ["DEMO", "MODULE", "GENERAL", "SUPPORT", "CUSTOM_MODULE"]) {
      expect(page).toContain(`${intent}:`);
    }
  });
});
