import { useId, useState, type FormEvent } from "react";
import { Ban, Clock, Lock as LockIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import type { DeviceLockState } from "@/security/device-lock";

const REASON_COPY: Record<NonNullable<DeviceLockState["reason"]>, { title: string; description: string }> = {
  inactivity: {
    title: "Locked for your security",
    description: "This app locks itself after a period of inactivity. Enter your unlock passcode to continue.",
  },
  manual: {
    title: "Locked",
    description: "Enter your unlock passcode to continue.",
  },
  offline_session_expired: {
    title: "Your session has expired",
    description: "This device has been offline too long to trust its cached credentials. Connect to the internet and sign in again to continue.",
  },
  revoked: {
    title: "Device access removed",
    description: "This device's access was revoked. Cached business data on this computer has been removed for your protection. Contact your administrator if this is unexpected.",
  },
};

/** Shown whenever the device lock is active. Only "inactivity" and "manual" can be cleared with the local passcode; the other two route the user toward re-activation instead of offering a passcode field at all. */
export function LockScreen({ reason }: { reason: NonNullable<DeviceLockState["reason"]> }) {
  const { unlockWithPasscode, signOut, device } = useApp();
  const passcodeId = useId();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const copy = REASON_COPY[reason];
  const canUnlockWithPasscode = reason === "inactivity" || reason === "manual";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setChecking(true);
    const success = await unlockWithPasscode(passcode);
    setChecking(false);
    if (!success) {
      setError("That passcode is not correct.");
      setPasscode("");
    }
  }

  const Icon = reason === "revoked" ? Ban : reason === "offline_session_expired" ? Clock : LockIcon;

  return (
    <main
      id="main-content"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--rf-muted)" }}
    >
      <Card style={{ width: "100%", maxWidth: "24rem", textAlign: "center" }}>
        <div
          style={{
            width: "3rem",
            height: "3rem",
            borderRadius: "999px",
            margin: "0 auto 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: reason === "revoked" ? "color-mix(in oklch, var(--rf-destructive) 15%, transparent)" : "color-mix(in oklch, var(--rf-primary) 15%, transparent)",
          }}
        >
          <Icon size={22} color={reason === "revoked" ? "var(--rf-destructive)" : "var(--rf-primary)"} aria-hidden="true" />
        </div>
        <h1 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem", fontWeight: 700 }}>{copy.title}</h1>
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>{copy.description}</p>

        {canUnlockWithPasscode ? (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "left" }}>
            <label htmlFor={passcodeId} style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              Unlock passcode
            </label>
            <input
              id={passcodeId}
              type="password"
              inputMode="numeric"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "var(--rf-radius-md)", border: "1px solid var(--rf-border)", background: "var(--rf-background)", fontSize: "0.875rem", textAlign: "center", letterSpacing: "0.3em" }}
            />
            {error ? (
              <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-destructive)" }}>
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={checking}>
              Unlock
            </Button>
          </form>
        ) : (
          <Button onClick={() => void signOut()} variant="secondary">
            {reason === "revoked" ? "Return to activation" : "Sign in again"}
          </Button>
        )}

        {device ? (
          <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Signed in as {device.userName}</p>
        ) : null}
      </Card>
    </main>
  );
}
