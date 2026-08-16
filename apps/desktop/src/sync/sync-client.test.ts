import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncClient } from "@/sync/sync-client";
import { SyncClientError, type ActivateDeviceRequest, type ActivateDeviceResponse } from "@/contract/sync-contract";

/**
 * Mimics WebView2's real, receiver-sensitive `fetch`: it only works when
 * called with `globalThis` (the browser's `window`) as the receiver. A
 * caller that stores the bare function reference and later invokes it as
 * `someObject.fetchFn(...)` calls it with `someObject` as `this`, which
 * this fake rejects exactly like the native implementation does -
 * reproducing "Failed to execute 'fetch' on 'Window': Illegal invocation"
 * without needing an actual browser.
 */
function createReceiverSensitiveFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  return function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return Promise.resolve(handler(input, init));
  };
}

const activateRequest: ActivateDeviceRequest = {
  activationCode: "ABCDE-23456",
  installationId: "installation-1",
  name: "Front Desk PC",
  platform: "windows",
  moduleKeys: ["fleet", "pos"],
};

const activateResponse: ActivateDeviceResponse = {
  deviceId: "device-1",
  organizationId: "org-1",
  userId: "user-1",
  userName: "Jordan Example",
  token: "device-token",
  tokenExpiresAt: "2026-09-15T00:00:00.000Z",
  offlineAccessUntil: "2026-08-19T00:00:00.000Z",
  moduleKeys: ["fleet", "pos"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SyncClient: default fetch binding", () => {
  it("activates a device through a receiver-sensitive host fetch without the caller supplying one", async () => {
    // No fetchFn override: SyncClient must fall back to a correctly-bound
    // globalThis.fetch, not a bare reference invoked as `this.fetchFn(...)`.
    // Against the pre-fix `this.fetchFn = options.fetchFn ?? fetch`, this
    // test throws "Illegal invocation" and fails.
    vi.stubGlobal(
      "fetch",
      createReceiverSensitiveFetch((_input, init) =>
        Response.json(activateResponse, { status: 200, headers: (init?.headers as Record<string, string>) ?? {} }),
      ),
    );

    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null });
    await expect(client.activateDevice(activateRequest)).resolves.toEqual(activateResponse);
  });

  it("sends the activation request to /api/desktop/activate with the exact POST body", async () => {
    let capturedUrl: RequestInfo | URL | null = null;
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      createReceiverSensitiveFetch((input, init) => {
        capturedUrl = input;
        capturedInit = init;
        return Response.json(activateResponse);
      }),
    );

    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null });
    await client.activateDevice(activateRequest);

    expect(String(capturedUrl)).toBe("https://api.rockfrostgroup.com/api/desktop/activate");
    expect(capturedInit).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(capturedInit?.body as string)).toEqual(activateRequest);
    // Activation is deliberately unauthenticated: no token exists yet.
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("SyncClient: injected fetch mocks", () => {
  it("uses a caller-supplied fetchFn as-is and never touches globalThis.fetch", async () => {
    const globalFetchSpy = vi.fn();
    vi.stubGlobal("fetch", globalFetchSpy);
    const fetchFn = vi.fn(async () => Response.json(activateResponse));

    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null, fetchFn });
    const result = await client.activateDevice(activateRequest);

    expect(result).toEqual(activateResponse);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });
});

describe("SyncClient: failure handling", () => {
  it("turns a network-level rejection into a retryable SyncClientError", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null, fetchFn });

    await expect(client.activateDevice(activateRequest)).rejects.toMatchObject({
      name: "SyncClientError",
      kind: "network_error",
      retryable: true,
    });
  });

  it("never resolves with device data when the local fetch invocation itself throws before any request is sent", async () => {
    // Reproduces the exact pre-fix failure mode: fetchFn throws
    // synchronously (an "Illegal invocation" TypeError, not a network
    // error from a dispatched request). activateDevice() must reject -
    // never resolve with a fabricated ActivateDeviceResponse - and the
    // caller (AppProvider.activate) only calls setDevice() inside the
    // success path after this promise resolves, so a device is never
    // marked activated. Because the throw happens before fetchFn's
    // handler runs, no request handler observes an invocation, matching
    // production reality: the server's activation-code claim never runs.
    let serverHandlerCalls = 0;
    const fetchFn = (): Promise<Response> => {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    };
    const wrappedFetchFn = vi.fn((...args: Parameters<typeof fetchFn>) => {
      serverHandlerCalls += 1;
      return fetchFn(...args);
    });
    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null, fetchFn: wrappedFetchFn });

    let resolved: ActivateDeviceResponse | undefined;
    let rejected: unknown;
    try {
      resolved = await client.activateDevice(activateRequest);
    } catch (error) {
      rejected = error;
    }

    expect(resolved).toBeUndefined();
    expect(rejected).toBeInstanceOf(SyncClientError);
    expect((rejected as SyncClientError).kind).toBe("network_error");
    // fetchFn was invoked (the call was attempted) but its own throw means
    // no HTTP request left the process, so a real backend's single-use
    // activation-code claim is never exercised.
    expect(serverHandlerCalls).toBe(1);
  });

  it("resolves with device data only after the server responds ok, never eagerly", async () => {
    let releaseResponse!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const fetchFn = vi.fn(async () => {
      await gate;
      return Response.json(activateResponse);
    });
    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null, fetchFn });

    let settled = false;
    const pending = client.activateDevice(activateRequest).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false); // still waiting on the server "acknowledgement"

    releaseResponse();
    await expect(pending).resolves.toEqual(activateResponse);
    expect(settled).toBe(true);
  });

  it("classifies a non-ok activation response as a non-retryable error and does not resolve", async () => {
    const fetchFn = vi.fn(async () => Response.json({ error: "Activation code already used or expired." }, { status: 400 }));
    const client = new SyncClient({ apiBaseUrl: "https://api.rockfrostgroup.com", getAccessToken: () => null, fetchFn });

    await expect(client.activateDevice(activateRequest)).rejects.toMatchObject({
      name: "SyncClientError",
      kind: "invalid_request",
      retryable: false,
      message: "Activation code already used or expired.",
    });
  });
});
