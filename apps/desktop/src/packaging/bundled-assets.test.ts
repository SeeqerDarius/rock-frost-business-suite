import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged frontend assets", () => {
  it("uses relative asset URLs that Tauri can load", async () => {
    const html = await readFile(resolve(process.cwd(), "dist/index.html"), "utf8");

    expect(html).toMatch(/(?:src|href)="\.\/assets\//);
    expect(html).not.toMatch(/(?:src|href)="\/assets\//);
  });

  it("allows the real sync API origin in the CSP connect-src, so fetch is not silently blocked", async () => {
    // A CSP connect-src that omits the API origin blocks every fetch()
    // to it with a generic "Failed to fetch" - indistinguishable in the
    // UI from a real network outage, and easy to miss because it only
    // shows up once fetch is actually reachable (see sync-client.ts's
    // receiver-binding fix, which unmasked exactly this).
    const html = await readFile(resolve(process.cwd(), "dist/index.html"), "utf8");
    const cspContent = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
    expect(cspContent).not.toBe("");
    const connectSrc = cspContent.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src")) ?? "";
    expect(connectSrc).toContain("https://app.rockfrostgroup.com");
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
