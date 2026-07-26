import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { db } from "@/lib/db";
import { activateSubscriptionAction, cancelSubscriptionAction, createSubscriptionAction } from "./actions";

export default async function PlatformSubscriptionsPage() {
  await requirePlatformOperator();
  const [organizations, modules, requests, subscriptions] = await Promise.all([
    db.organization.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] } }, orderBy: { name: "asc" } }),
    db.module.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.moduleRequest.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "APPROVED"] } }, include: { organization: true, module: true, contactSubmission: true }, orderBy: { createdAt: "desc" } }),
    db.subscription.findMany({ include: { organization: true, module: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Create agreements, record payment, and control time-bounded module access." />
      <Card>
        <CardHeader><CardTitle>New subscription</CardTitle><CardDescription>Manual/offline records a negotiated payment. Platform-managed marks subscriptions intended for automated renewal once a payment gateway is connected.</CardDescription></CardHeader>
        <CardContent>
          <form action={createSubscriptionAction} className="grid gap-4 md:grid-cols-3">
            <FieldSelect name="organizationId" label="Organization" items={organizations.map((x) => [x.id, x.name])} />
            <FieldSelect name="moduleId" label="Module" items={modules.map((x) => [x.id, x.name])} />
            <FieldSelect name="mode" label="Billing mode" items={[["MANUAL_OFFLINE", "Manual / offline agreement"], ["PLATFORM_MANAGED", "Platform-managed billing"]]} />
            <div><Label htmlFor="durationMonths">Duration (months)</Label><Input id="durationMonths" name="durationMonths" type="number" min="1" max="120" defaultValue="12" required /></div>
            <div><Label htmlFor="amount">Agreed amount</Label><Input id="amount" name="amount" type="number" min="0" step="0.01" required /></div>
            <div><Label htmlFor="currency">Currency</Label><Input id="currency" name="currency" defaultValue="GHS" maxLength={3} required /></div>
            <div className="md:col-span-3"><Label htmlFor="moduleRequestId">Related request</Label><select id="moduleRequestId" name="moduleRequestId" defaultValue="" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">No linked request</option>{requests.map((r) => <option key={r.id} value={r.id}>{r.organization.name} · {r.module?.name ?? r.title}</option>)}</select></div>
            <div className="md:col-span-3"><Label htmlFor="notes">Agreement notes</Label><Textarea id="notes" name="notes" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoRenew" value="true" /> Auto-renew (platform-managed)</label>
            <div className="md:col-span-3"><Button type="submit">Create pending subscription</Button></div>
          </form>
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Subscription ledger</h2>
        {subscriptions.map((subscription) => (
          <Card key={subscription.id}>
            <CardHeader><div className="flex justify-between gap-3"><div><CardTitle>{subscription.organization.name} · {subscription.module.name}</CardTitle><CardDescription>{subscription.mode.replaceAll("_", " ").toLowerCase()} · {subscription.durationMonths} months · {subscription.currency} {subscription.amount.toString()}</CardDescription></div><Badge>{subscription.status}</Badge></div></CardHeader>
            <CardContent className="space-y-3">
              {subscription.status === "PENDING_PAYMENT" ? (
                <form action={activateSubscriptionAction} className="grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="subscriptionId" value={subscription.id} />
                  <Input name="paymentReference" placeholder="Payment reference" required />
                  <Input name="paymentMethod" placeholder="Bank, cash, mobile money…" required />
                  <Input name="startsAt" type="date" />
                  <Button type="submit">Confirm payment and activate</Button>
                </form>
              ) : <p className="text-sm text-muted-foreground">{subscription.startsAt?.toLocaleDateString() ?? "—"} → {subscription.endsAt?.toLocaleDateString() ?? "—"} {subscription.paymentReference ? `· ${subscription.paymentReference}` : ""}</p>}
              {!["CANCELLED", "EXPIRED"].includes(subscription.status) ? <form action={cancelSubscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id} /><Button type="submit" size="sm" variant="outline">Cancel subscription</Button></form> : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function FieldSelect({ name, label, items }: { name: string; label: string; items: [string, string][] }) {
  return <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required defaultValue="" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="" disabled>Select…</option>{items.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>;
}
