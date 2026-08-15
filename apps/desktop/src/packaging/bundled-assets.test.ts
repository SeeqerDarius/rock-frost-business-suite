import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged frontend assets", () => {
  it("uses relative asset URLs that Tauri can load", async () => {
    const html = await readFile(resolve(process.cwd(), "dist/index.html"), "utf8");

    expect(html).toMatch(/(?:src|href)="\.\/assets\//);
    expect(html).not.toMatch(/(?:src|href)="\/assets\//);
  });
});
