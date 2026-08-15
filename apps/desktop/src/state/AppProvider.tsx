import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createLocalDatabase } from "@/db/create-local-database";
import { createCredentialStore } from "@/security/create-credential-store";
import type { LocalDatabase } from "@/db/local-database";
import type { CredentialStore } from "@/security/credential-store";
import type { DeviceRecord } from "@/db/schema";
import { DeviceLockController, type DeviceLockState } from "@/security/device-lock";
import { handleRemoteRevocation } from "@/security/revocation";
import { getDeviceDisplayName, getOrCreateDeviceId } from "@/security/device-identity";
import { hashPasscode, verifyPasscode } from "@/security/local-passcode";
import { SyncClient } from "@/sync/sync-client";
import { SyncEngine, type SyncEngineStatus } from "@/sync/sync-engine";
import { SyncClientError, type ActivateDeviceResponse, type OfflineModuleKey } from "@/contract/sync-contract";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

interface AppContextValue {
  db: LocalDatabase;
  credentials: CredentialStore;
  device: DeviceRecord | null;
  lockState: DeviceLockState;
  syncStatus: SyncEngineStatus | null;
  isActivating: boolean;
  activationError: string | null;
  activate: (activationCode: string, deviceName: string, moduleKeys: OfflineModuleKey[], unlockPasscode: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Verifies the passcode locally (no network required: see security/local-passcode.ts) before unlocking. Returns false on a wrong passcode or when the lock reason isn't unlockable this way (offline-expired/revoked locks require re-activation, not a passcode). */
  unlockWithPasscode: (passcode: string) => Promise<boolean>;
  recordActivity: () => void;
  configured: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp() must be called within <AppProvider>.");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useMemo(() => createLocalDatabase(), []);
  const credentials = useMemo(() => createCredentialStore(), []);
  const lockController = useMemo(() => new DeviceLockController(), []);

  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [lockState, setLockState] = useState<DeviceLockState>(lockController.getState());
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const syncEngineRef = useRef<SyncEngine | null>(null);

  // Load any previously-activated device on first mount.
  useEffect(() => {
    let cancelled = false;
    void db.getActiveDevice().then((existing) => {
      if (!cancelled) setDevice(existing);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    lockController.start();
    const unsubscribe = lockController.subscribe(setLockState);
    return () => {
      unsubscribe();
      lockController.stop();
    };
  }, [lockController]);

  useEffect(() => {
    const updateConnectivity = () => lockController.updateSyncStatus({
      accessTokenExpiresAt: null,
      lastSuccessfulServerContactAt: null,
      isOnline: navigator.onLine,
    });
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    updateConnectivity();
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, [lockController]);

  const buildSyncEngine = useCallback(
    (activeDevice: DeviceRecord) => {
      if (!API_BASE_URL) return null;

      const client = new SyncClient({
        apiBaseUrl: API_BASE_URL,
        getAccessToken: () => syncEngineRef.current !== null ? cachedAccessTokenRef.current : null,
      });

      const engine = new SyncEngine({
        db,
        client,
        enabledModuleKeys: activeDevice.enabledModuleKeys,
        deviceId: activeDevice.deviceId,
        onRevoked: async () => {
          await handleRemoteRevocation({ db, credentials, lockController }, activeDevice.deviceId);
          setDevice(await db.getActiveDevice());
        },
        onSessionExpired: async () => {
          lockController.lockManually();
        },
      });

      engine.subscribe(setSyncStatus);
      return engine;
    },
    [db, credentials, lockController],
  );

  // Holds the in-memory access token separately from React state, since
  // SyncClient reads it synchronously and frequently: routing every read
  // through a state setter/getter pair would be needless re-render churn.
  const cachedAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!device || device.deactivatedAt) {
      syncEngineRef.current = null;
      return;
    }
    void credentials.get("accessToken").then((token) => {
      cachedAccessTokenRef.current = token;
      const engine = buildSyncEngine(device);
      syncEngineRef.current = engine;
      void engine?.refreshPendingCounts();
    });
    const moduleKey = device.enabledModuleKeys[0];
    if (moduleKey) {
      void db.getCachedRecord(moduleKey, `${moduleKey}.offline_authorization`, device.deviceId).then((record) => {
        const value = record?.payload;
        if (value && typeof value === "object" && "offlineAccessUntil" in value && typeof value.offlineAccessUntil === "string") {
          lockController.updateSyncStatus({ accessTokenExpiresAt: null, offlineAccessUntil: new Date(value.offlineAccessUntil).getTime(), lastSuccessfulServerContactAt: null, isOnline: navigator.onLine });
        }
      });
    }
  }, [device, credentials, buildSyncEngine, db, lockController]);

  const activate = useCallback(
    async (activationCode: string, deviceName: string, moduleKeys: OfflineModuleKey[], unlockPasscode: string) => {
      if (!API_BASE_URL) {
        setActivationError("This build has no VITE_API_BASE_URL configured. See apps/desktop/.env.example.");
        return;
      }
      setIsActivating(true);
      setActivationError(null);
      try {
        const bootstrapClient = new SyncClient({ apiBaseUrl: API_BASE_URL, getAccessToken: () => null });
        const installationId = getOrCreateDeviceId();
        const response: ActivateDeviceResponse = await bootstrapClient.activateDevice({
          activationCode: activationCode.trim().toUpperCase(),
          installationId,
          name: deviceName || getDeviceDisplayName(),
          platform: "windows",
          moduleKeys,
        });

        await credentials.set("accessToken", response.token);
        cachedAccessTokenRef.current = response.token;

        const storedPasscode = await hashPasscode(unlockPasscode);
        await credentials.set("unlockPasscodeHash", storedPasscode.hash);
        await credentials.set("unlockPasscodeSalt", storedPasscode.salt);

        const activeDevice: DeviceRecord = {
          deviceId: response.deviceId,
          deviceName: deviceName || getDeviceDisplayName(),
          organizationId: response.organizationId,
          userId: response.userId,
          userName: response.userName,
          enabledModuleKeys: response.moduleKeys,
          activatedAt: new Date().toISOString(),
          deactivatedAt: null,
          deactivationReason: null,
        };
        await db.saveDevice(activeDevice);

        const authorizationModule = response.moduleKeys[0];
        if (authorizationModule) await db.upsertCachedRecord({
          moduleKey: authorizationModule,
          entityType: `${authorizationModule}.offline_authorization`,
          entityId: response.deviceId,
          version: 0,
          payload: { offlineAccessUntil: response.offlineAccessUntil },
          hasPendingLocalChange: false,
          updatedAt: new Date().toISOString(),
          updatedByUserId: null,
          updatedByUserName: null,
        });

        for (const moduleKey of response.moduleKeys) {
          await db.setSyncCursor(moduleKey, "");
        }

        lockController.updateSyncStatus({
          accessTokenExpiresAt: new Date(response.tokenExpiresAt).getTime(),
          offlineAccessUntil: new Date(response.offlineAccessUntil).getTime(),
          lastSuccessfulServerContactAt: Date.now(),
          isOnline: true,
        });
        await db.appendAuditEvent("device_activated", { deviceId: response.deviceId, organizationId: response.organizationId });
        setDevice(activeDevice);
      } catch (error) {
        setActivationError(
          error instanceof SyncClientError
            ? error.message
            : "Could not activate this device. Check your connection and try again.",
        );
      } finally {
        setIsActivating(false);
      }
    },
    [db, credentials, lockController],
  );

  const signOut = useCallback(async () => {
    if (!device) return;
    try {
      const token = cachedAccessTokenRef.current;
      if (API_BASE_URL && token) {
        const client = new SyncClient({ apiBaseUrl: API_BASE_URL, getAccessToken: () => token });
        await client.deactivateDevice();
      }
    } catch {
      // Best-effort: the device still deactivates locally even if the
      // server couldn't be reached; it simply won't push again.
    }
    await db.deactivateDevice(device.deviceId, "user_signed_out");
    await db.purgeAllCachedRecords();
    await credentials.clear();
    await db.appendAuditEvent("device_deactivated", { deviceId: device.deviceId, reason: "user_signed_out" });
    cachedAccessTokenRef.current = null;
    syncEngineRef.current = null;
    setDevice(await db.getActiveDevice());
    setSyncStatus(null);
  }, [device, db, credentials]);

  const syncNow = useCallback(async () => {
    await syncEngineRef.current?.syncNow();
    if (!device) return;
    const moduleKey = device.enabledModuleKeys[0];
    if (!moduleKey) return;
    const authorization = await db.getCachedRecord(moduleKey, `${moduleKey}.offline_authorization`, device.deviceId);
    const value = authorization?.payload;
    if (value && typeof value === "object" && "offlineAccessUntil" in value && typeof value.offlineAccessUntil === "string") {
      lockController.updateSyncStatus({ accessTokenExpiresAt: null, offlineAccessUntil: new Date(value.offlineAccessUntil).getTime(), lastSuccessfulServerContactAt: Date.now(), isOnline: navigator.onLine });
    }
  }, [db, device, lockController]);

  const unlockWithPasscode = useCallback(
    async (passcode: string) => {
      if (lockState.reason === "offline_session_expired" || lockState.reason === "revoked") return false;
      const [hash, salt] = await Promise.all([credentials.get("unlockPasscodeHash"), credentials.get("unlockPasscodeSalt")]);
      if (!hash || !salt) return false;
      const valid = await verifyPasscode(passcode, { hash, salt });
      if (!valid) return false;
      lockController.unlock();
      await db.appendAuditEvent("device_unlocked", { deviceId: device?.deviceId ?? null });
      return true;
    },
    [credentials, lockController, lockState.reason, db, device],
  );
  const recordActivity = useCallback(() => lockController.recordActivity(), [lockController]);

  const value: AppContextValue = {
    db,
    credentials,
    device,
    lockState,
    syncStatus,
    isActivating,
    activationError,
    activate,
    signOut,
    syncNow,
    unlockWithPasscode,
    recordActivity,
    configured: Boolean(API_BASE_URL),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
