import { AppProvider, useApp } from "@/state/AppProvider";
import { DeviceActivationScreen } from "@/shell/DeviceActivationScreen";
import { LockScreen } from "@/shell/LockScreen";
import { AppShell } from "@/shell/AppShell";

/**
 * The entire screen-selection logic for the app, in one place:
 *  - No activated device on this installation yet -> activation screen.
 *  - Device activated but currently deactivated (revoked/signed out) ->
 *    back to activation (deviceId is reused, per device-identity.ts).
 *  - Device locked (inactivity, manual, offline-expired, or revoked) ->
 *    lock screen, with copy specific to the reason.
 *  - Otherwise -> the real shell.
 */
function Screens() {
  const { device, lockState } = useApp();

  if (!device || device.deactivatedAt) {
    return <DeviceActivationScreen />;
  }

  if (lockState.locked && lockState.reason) {
    return <LockScreen reason={lockState.reason} />;
  }

  return <AppShell />;
}

export function App() {
  return (
    <AppProvider>
      <Screens />
    </AppProvider>
  );
}
