import { describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { DesktopUpdateService, type UpdateRuntime } from "@/update/update-service";

function fakeUpdate(version = "0.2.1") {
  return {
    version,
    currentVersion: "0.2.0",
    downloadAndInstall: vi.fn(async (listener) => {
      listener?.({ event: "Started", data: { contentLength: 100 } });
      listener?.({ event: "Progress", data: { chunkLength: 100 } });
      listener?.({ event: "Finished" });
    }),
  } as unknown as Update;
}

describe("DesktopUpdateService", () => {
  it("reports that the installed version is current", async () => {
    const runtime: UpdateRuntime = { check: vi.fn(async () => null), relaunch: vi.fn() };
    const service = new DesktopUpdateService(async () => runtime);
    await service.check();
    expect(service.getState()).toEqual({ status: "current" });
  });

  it("downloads a verified update, installs it, and relaunches", async () => {
    const update = fakeUpdate();
    const runtime: UpdateRuntime = { check: vi.fn(async () => update), relaunch: vi.fn() };
    const service = new DesktopUpdateService(async () => runtime);
    await service.check();
    expect(service.getState()).toMatchObject({ status: "available", update });
    await service.install(update);
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(runtime.relaunch).toHaveBeenCalledOnce();
  });

  it("surfaces update-check failures without interrupting offline work", async () => {
    const service = new DesktopUpdateService(async () => ({
      check: vi.fn(async () => { throw new Error("Update service unavailable"); }),
      relaunch: vi.fn(),
    }));
    await service.check();
    expect(service.getState()).toEqual({ status: "error", message: "Update service unavailable" });
  });
});
