import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/desktop/releases/latest/route";

afterEach(() => vi.unstubAllGlobals());

describe("desktop update release endpoint", () => {
  it("returns 204 while no public updater release exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const response = await GET();
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("proxies a valid HTTPS updater manifest", async () => {
    const manifest = {
      version: "0.2.1",
      platforms: {
        "windows-x86_64-nsis": {
          signature: "a".repeat(64),
          url: "https://github.com/SeeqerDarius/rock-frost-business-suite/releases/download/desktop-v0.2.1/app.exe",
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(manifest)));
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(manifest);
  });

  it("rejects an insecure artifact URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      version: "0.2.1",
      platforms: { "windows-x86_64": { signature: "a".repeat(64), url: "http://example.com/update.exe" } },
    })));
    const response = await GET();
    expect(response.status).toBe(502);
  });

  it("rejects a manifest without any platform artifact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ version: "0.2.1", platforms: {} })));
    const response = await GET();
    expect(response.status).toBe(502);
  });
});
