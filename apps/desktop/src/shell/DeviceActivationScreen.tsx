import { useId, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, ErrorText } from "@/components/form-fields";
import { useApp } from "@/state/AppProvider";
import { getDeviceDisplayName } from "@/security/device-identity";
import { isValidPasscodeFormat } from "@/security/local-passcode";
import type { OfflineModuleKey } from "@/contract/sync-contract";

const MODULES: { key: OfflineModuleKey; label: string }[] = [
  { key: "fleet", label: "Fleet" }, { key: "installment", label: "Installment" },
  { key: "inventory", label: "Inventory" }, { key: "pos", label: "Point of sale" },
  { key: "school", label: "School" },
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
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-muted p-8">
      <Card className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/15">
            <ShieldCheck size={20} className="text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="m-0 text-lg font-bold">Activate this device</h1>
            <p className="m-0 text-[0.8125rem] text-muted-foreground">Use the one-time code from your account</p>
          </div>
        </div>
        {!configured ? <ErrorText>This build has no server address configured.</ErrorText> : null}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
          <Field label="Activation code" id={codeId} hint="Codes expire after 10 minutes and can be used once.">
            <Input id={codeId} value={activationCode} onChange={(e) => setActivationCode(e.target.value.toUpperCase())} autoComplete="one-time-code" placeholder="ABCDE-23456" />
          </Field>
          <Field label="Device name" id={deviceNameId}>
            <Input id={deviceNameId} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </Field>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-[0.8125rem] font-semibold">Modules authorized by your code</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {MODULES.map((module) => (
                <label key={module.key} className="flex items-center gap-1.5 text-[0.8125rem]">
                  <Checkbox checked={moduleKeys.includes(module.key)} onCheckedChange={() => toggleModule(module.key)} />
                  {module.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Local unlock passcode" id={passcodeId} hint="4 to 8 digits. This passcode stays on this device.">
            <Input id={passcodeId} type="password" inputMode="numeric" autoComplete="new-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
          </Field>
          <Field label="Confirm passcode" id={confirmId}>
            <Input id={confirmId} type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {formError || activationError ? <ErrorText>{formError ?? activationError}</ErrorText> : null}
          <Button type="submit" loading={isActivating} disabled={!configured}>{isActivating ? "Activating device" : "Activate device"}</Button>
        </form>
      </Card>
    </main>
  );
}
