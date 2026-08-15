import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged frontend assets", () => {
  it("uses relative asset URLs that Tauri can load", async () => {
    const html = await readFile(resolve(process.cwd(), "dist/index.html"), "utf8");

    expect(html).toMatch(/(?:src|href)="\.\/assets\//);
    expect(html).not.toMatch(/(?:src|href)="\/assets\//);
  });

  it("does not replace a React screen after the startup marker is removed", async () => {
    const guard = await readFile(resolve(process.cwd(), "public/startup-guard.js"), "utf8");
    const entrypoint = await readFile(resolve(process.cwd(), "src/main.tsx"), "utf8");

    expect(guard).toContain('!root.querySelector("#startup-status")');
    expect(guard).toContain('root.querySelector("#startup-status")');
    expect(guard).toContain("__ROCK_FROST_MARK_READY__");
    expect(entrypoint).toContain("new MutationObserver");
    expect(entrypoint).toContain("__ROCK_FROST_MARK_READY__?.()");
  });
});
