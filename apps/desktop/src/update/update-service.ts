import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "available"; update: Update }
  | { status: "downloading"; update: Update; downloadedBytes: number; totalBytes: number | null }
  | { status: "installing"; update: Update }
  | { status: "error"; message: string };

export interface UpdateRuntime {
  check: () => Promise<Update | null>;
  relaunch: () => Promise<void>;
}

export async function createUpdateRuntime(): Promise<UpdateRuntime> {
  const [{ check }, { relaunch }] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    import("@tauri-apps/plugin-process"),
  ]);
  return { check: () => check({ timeout: 15_000 }), relaunch };
}

export class DesktopUpdateService {
  private state: UpdateCheckState = { status: "idle" };
  private readonly listeners = new Set<(state: UpdateCheckState) => void>();

  constructor(private readonly runtimeFactory: () => Promise<UpdateRuntime> = createUpdateRuntime) {}

  getState() {
    return this.state;
  }

  subscribe(listener: (state: UpdateCheckState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(state: UpdateCheckState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  async check() {
    if (this.state.status === "checking" || this.state.status === "downloading" || this.state.status === "installing") return;
    this.publish({ status: "checking" });
    try {
      const runtime = await this.runtimeFactory();
      const update = await runtime.check();
      this.publish(update ? { status: "available", update } : { status: "current" });
    } catch (error) {
      this.publish({ status: "error", message: readableError(error, "Could not check for updates.") });
    }
  }

  async install(update: Update) {
    let downloadedBytes = 0;
    let totalBytes: number | null = null;
    try {
      const runtime = await this.runtimeFactory();
      this.publish({ status: "downloading", update, downloadedBytes, totalBytes });
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") totalBytes = event.data.contentLength ?? null;
        if (event.event === "Progress") downloadedBytes += event.data.chunkLength;
        this.publish(
          event.event === "Finished"
            ? { status: "installing", update }
            : { status: "downloading", update, downloadedBytes, totalBytes },
        );
      });
      this.publish({ status: "installing", update });
      await runtime.relaunch();
    } catch (error) {
      this.publish({ status: "error", message: readableError(error, "The update could not be installed.") });
    }
  }
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
