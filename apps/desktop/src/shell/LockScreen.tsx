import { useId, useState, type FormEvent } from "react";
import { Ban, Clock, Lock as LockIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { ErrorText } from "@/components/form-fields";
import { cn } from "@/lib/utils";
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
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-muted p-8">
      <Card className="w-full max-w-sm text-center">
        <div className={cn("mx-auto mb-4 flex size-12 items-center justify-center rounded-full", reason === "revoked" ? "bg-destructive/15" : "bg-primary/15")}>
          <Icon size={22} className={reason === "revoked" ? "text-destructive" : "text-primary"} aria-hidden="true" />
        </div>
        <h1 className="mt-0 mb-1.5 text-[1.05rem] font-bold">{copy.title}</h1>
        <p className="mt-0 mb-5 text-[0.8125rem] text-muted-foreground">{copy.description}</p>

        {canUnlockWithPasscode ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
            <label htmlFor={passcodeId} className="text-[0.8125rem] font-semibold">
              Unlock passcode
            </label>
            <Input
              id={passcodeId}
              type="password"
              inputMode="numeric"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="text-center tracking-[0.3em]"
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
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
          <p className="mt-4 text-xs text-muted-foreground">Signed in as {device.userName}</p>
        ) : null}
      </Card>
    </main>
  );
}
