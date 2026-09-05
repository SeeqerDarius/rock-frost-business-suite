import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(host: string, path: string) {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

describe("subdomain routing proxy", () => {
  it("moves legacy platform URLs from www to the admin host", async () => {
    const response = await proxy(request("www.rockfrostgroup.com", "/app/platform/dashboard?tab=activity"));
    expect(response.headers.get("location")).toBe(
      "https://admin.rockfrostgroup.com/app/platform/dashboard?tab=activity",
    );
  });

  it("moves legacy tenant and login URLs from www to the tenant host", async () => {
    expect((await proxy(request("www.rockfrostgroup.com", "/app/dashboard"))).headers.get("location")).toBe(
      "https://app.rockfrostgroup.com/app/dashboard",
    );
    expect((await proxy(request("www.rockfrostgroup.com", "/login"))).headers.get("location")).toBe(
      "https://app.rockfrostgroup.com/login",
    );
  });

  it("keeps platform and tenant workspace paths on their matching hosts", async () => {
    expect((await proxy(request("admin.rockfrostgroup.com", "/app/platform/dashboard"))).headers.get("location")).toBeNull();
    expect((await proxy(request("app.rockfrostgroup.com", "/app/dashboard"))).headers.get("location")).toBeNull();
  });

  it("moves cross-surface workspace paths to the correct host", async () => {
    expect((await proxy(request("app.rockfrostgroup.com", "/app/platform/settings"))).headers.get("location")).toBe(
      "https://admin.rockfrostgroup.com/app/platform/settings",
    );
    expect((await proxy(request("admin.rockfrostgroup.com", "/app/dashboard"))).headers.get("location")).toBe(
      "https://admin.rockfrostgroup.com/app/platform/dashboard",
    );
  });
});
