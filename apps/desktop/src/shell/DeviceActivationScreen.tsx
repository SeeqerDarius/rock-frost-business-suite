import { useId, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { getDeviceDisplayName } from "@/security/device-identity";
import { isValidPasscodeFormat } from "@/security/local-passcode";

/**
 * First-run flow: sign in with the same email/password used on the Rock
 * Frost web app, name this device, and set a short local unlock passcode
 * (used only by the offline lock screen — see security/local-passcode.ts).
 * A single form covers both "sign in" and "activate this device" because
 * they are, for this client, the same server call
 * (POST /api/desktop/activate) — see contract/sync-contract.ts.
 */
export function DeviceActivationScreen() {
  const { activate, isActivating, activationError, configured } = useApp();
  const emailId = useId();
  const passwordId = useId();
  const deviceNameId = useId();
  const passcodeId = useId();
  const passcodeConfirmId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState(getDeviceDisplayName());
  const [passcode, setPasscode] = useState("");
  const [passcodeConfirm, setPasscodeConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError("Enter your email and password.");
      return;
    }
    if (!isValidPasscodeFormat(passcode)) {
      setFormError("Set a 4 to 8 digit unlock passcode.");
      return;
    }
    if (passcode !== passcodeConfirm) {
      setFormError("Passcodes do not match.");
      return;
    }

    void activate(email.trim(), password, deviceName.trim(), passcode);
  }

  return (
    <main
      id="main-content"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--rf-muted)" }}
    >
      <Card style={{ width: "100%", maxWidth: "26rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "2.5rem", height: "2.5rem", borderRadius: "var(--rf-radius-md)", background: "color-mix(in oklch, var(--rf-primary) 15%, transparent)" }}>
            <ShieldCheck size={20} color="var(--rf-primary)" aria-hidden="true" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Activate this device</h1>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>Sign in with your Rock Frost account</p>
          </div>
        </div>

        {!configured ? (
          <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--rf-destructive)", marginBottom: "1rem" }}>
            This build has no server address configured. See apps/desktop/.env.example.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <Field label="Email" id={emailId}>
            <input
              id={emailId}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Password" id={passwordId}>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Device name" id={deviceNameId} hint="Helps you recognize this computer in your account's device list.">
            <input id={deviceNameId} type="text" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Set an unlock passcode" id={passcodeId} hint="4 to 8 digits. Used only to unlock this app when your computer is offline.">
            <input
              id={passcodeId}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Confirm passcode" id={passcodeConfirmId}>
            <input
              id={passcodeConfirmId}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={passcodeConfirm}
              onChange={(e) => setPasscodeConfirm(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {formError || activationError ? (
            <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-destructive)" }}>
              {formError ?? activationError}
            </p>
          ) : null}

          <Button type="submit" loading={isActivating} disabled={!configured}>
            {isActivating ? "Activating device" : "Activate and sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.3rem" }}>
        {label}
      </label>
      {children}
      {hint ? (
        <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{hint}</p>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: "var(--rf-radius-md)",
  border: "1px solid var(--rf-border)",
  background: "var(--rf-background)",
  fontSize: "0.875rem",
};
