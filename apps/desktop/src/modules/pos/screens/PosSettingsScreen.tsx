import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useApp } from "@/state/AppProvider";
import { createPosAdapter } from "@/modules/pos/adapter";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import { Field, inputStyle, ErrorText, SyncBadge } from "@/components/form-fields";

export function PosSettingsScreen({ snapshot, onChanged }: { snapshot: PosSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const settings = snapshot.settings;

  const [receiptFooterText, setReceiptFooterText] = useState(settings?.data.receiptFooterText ?? "");
  const [saleNumberPrefix, setSaleNumberPrefix] = useState(settings?.data.saleNumberPrefix ?? "");
  const [footerError, setFooterError] = useState<string | null>(null);
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const [savingFooter, setSavingFooter] = useState(false);
  const [savingPrefix, setSavingPrefix] = useState(false);

  useEffect(() => {
    setReceiptFooterText(settings?.data.receiptFooterText ?? "");
    setSaleNumberPrefix(settings?.data.saleNumberPrefix ?? "");
  }, [settings]);

  if (settings && !settings.data.canManageSettings) {
    return (
      <section aria-labelledby="pos-settings-heading">
        <h2 id="pos-settings-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Settings
        </h2>
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>
            You do not have permission to change POS settings on this device.
          </p>
        </Card>
      </section>
    );
  }

  async function handleSaveFooter(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    setFooterError(null);
    setSavingFooter(true);
    recordActivity();
    try {
      const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
      await adapter.updateReceiptFooter({ receiptFooterText: receiptFooterText.trim() || null }, settings?.version ?? 0);
      await onChanged();
    } catch {
      setFooterError("Could not queue this change. It may conflict with a newer cloud edit once synced.");
    } finally {
      setSavingFooter(false);
    }
  }

  async function handleSavePrefix(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    const normalized = saleNumberPrefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(normalized)) {
      setPrefixError("Use 2 to 8 letters or digits, such as SALE.");
      return;
    }
    setPrefixError(null);
    setSavingPrefix(true);
    recordActivity();
    try {
      const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
      await adapter.updateSalePrefix({ saleNumberPrefix: normalized }, settings?.data.saleNumberPrefixVersion ?? 0);
      await onChanged();
    } catch {
      setPrefixError("Could not queue this change. It may conflict with a newer cloud edit once synced.");
    } finally {
      setSavingPrefix(false);
    }
  }

  return (
    <section aria-labelledby="pos-settings-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <h2 id="pos-settings-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
          Settings
        </h2>
        {settings ? <SyncBadge pending={settings.hasPendingLocalChange} /> : null}
      </div>

      <Card>
        <form onSubmit={(e) => void handleSaveFooter(e)} noValidate style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Field label="Receipt footer text" id="pos-settings-footer" hint="Printed at the bottom of every receipt. Leave blank for no footer.">
            <textarea
              id="pos-settings-footer"
              value={receiptFooterText}
              onChange={(e) => setReceiptFooterText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>
          {footerError ? <ErrorText>{footerError}</ErrorText> : null}
          <Button type="submit" loading={savingFooter} style={{ alignSelf: "flex-start" }}>
            Save footer
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={(e) => void handleSavePrefix(e)} noValidate style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Field label="Sale number prefix" id="pos-settings-prefix" hint="2 to 8 letters or digits, used at the start of every generated sale number.">
            <input id="pos-settings-prefix" value={saleNumberPrefix} onChange={(e) => setSaleNumberPrefix(e.target.value)} style={inputStyle} />
          </Field>
          {prefixError ? <ErrorText>{prefixError}</ErrorText> : null}
          <Button type="submit" loading={savingPrefix} style={{ alignSelf: "flex-start" }}>
            Save prefix
          </Button>
        </form>
      </Card>
    </section>
  );
}
