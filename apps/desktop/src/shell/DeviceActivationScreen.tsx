import { useId, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { getDeviceDisplayName } from "@/security/device-identity";
import { isValidPasscodeFormat } from "@/security/local-passcode";
import type { OfflineModuleKey } from "@/contract/sync-contract";

const MODULES: { key: OfflineModuleKey; label: string }[] = [
  { key: "fleet", label: "Fleet" }, { key: "installment", label: "Installment" },
  { key: "inventory", label: "Inventory" }, { key: "pos", label: "Point of sale" },
];

export function DeviceActivationScreen() {
  const { activate, isActivating, activationError, configured } = useApp();
  const codeId = useId(); const deviceNameId = useId(); const passcodeId = useId(); const confirmId = useId();
  const [activationCode, setActivationCode] = useState("");
  const [deviceName, setDeviceName] = useState(getDeviceDisplayName());
  const [moduleKeys, setModuleKeys] = useState<OfflineModuleKey[]>([]);
  const [passcode, setPasscode] = useState(""); const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function toggleModule(key: OfflineModuleKey) {
    setModuleKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }
  function handleSubmit(event: FormEvent) {
    event.preventDefault(); setFormError(null);
    if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(activationCode.trim().toUpperCase())) {
      setFormError("Enter the activation code shown in your Rock Frost account."); return;
    }
    if (!deviceName.trim()) { setFormError("Enter a name for this device."); return; }
    if (!moduleKeys.length) { setFormError("Select at least one authorized module."); return; }
    if (!isValidPasscodeFormat(passcode)) { setFormError("Set a 4 to 8 digit unlock passcode."); return; }
    if (passcode !== confirm) { setFormError("Passcodes do not match."); return; }
    void activate(activationCode, deviceName.trim(), moduleKeys, passcode);
  }

  return (
    <main id="main-content" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--rf-muted)" }}>
      <Card style={{ width: "100%", maxWidth: "28rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "2.5rem", height: "2.5rem", borderRadius: "var(--rf-radius-md)", background: "color-mix(in oklch, var(--rf-primary) 15%, transparent)" }}><ShieldCheck size={20} color="var(--rf-primary)" aria-hidden="true" /></div>
          <div><h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Activate this device</h1><p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>Use the one-time code from your account</p></div>
        </div>
        {!configured ? <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--rf-destructive)" }}>This build has no server address configured.</p> : null}
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <Field label="Activation code" id={codeId} hint="Codes expire after 10 minutes and can be used once."><input id={codeId} value={activationCode} onChange={(e) => setActivationCode(e.target.value.toUpperCase())} autoComplete="one-time-code" placeholder="ABCDE-23456" style={inputStyle} /></Field>
          <Field label="Device name" id={deviceNameId}><input id={deviceNameId} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} style={inputStyle} /></Field>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.4rem" }}>Modules authorized by your code</legend><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>{MODULES.map((module) => <label key={module.key} style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: "0.8125rem" }}><input type="checkbox" checked={moduleKeys.includes(module.key)} onChange={() => toggleModule(module.key)} />{module.label}</label>)}</div></fieldset>
          <Field label="Local unlock passcode" id={passcodeId} hint="4 to 8 digits. This passcode stays on this device."><input id={passcodeId} type="password" inputMode="numeric" autoComplete="new-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} style={inputStyle} /></Field>
          <Field label="Confirm passcode" id={confirmId}><input id={confirmId} type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} /></Field>
          {formError || activationError ? <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-destructive)" }}>{formError ?? activationError}</p> : null}
          <Button type="submit" loading={isActivating} disabled={!configured}>{isActivating ? "Activating device" : "Activate device"}</Button>
        </form>
      </Card>
    </main>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.3rem" }}>{label}</label>{children}{hint ? <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{hint}</p> : null}</div>;
}
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.6rem 0.75rem", borderRadius: "var(--rf-radius-md)", border: "1px solid var(--rf-border)", background: "var(--rf-background)", fontSize: "0.875rem" };
