import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { decryptTotpSecret, getTotpUri } from "@/lib/auth/totp";
import { hasPendingSmsOtpChallenge } from "@/lib/auth/sms-otp";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  beginSmsTwoFactorSetup,
  confirmSmsTwoFactorSetup,
  requestDisableSmsCode,
} from "./actions";

const errors: Record<string, string> = {
  password: "Your current password is incorrect.",
  code: "That code is invalid or expired.",
  setup: "The setup key is missing or invalid. Generate a new one.",
  phone: "Enter a valid Ghana phone number.",
  "already-enabled": "Two-factor authentication is already active. Disable it first to switch methods.",
  "sms-failed": "We couldn't send the SMS code. Try again shortly.",
};

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; setup?: string; smsSetup?: string; disableCodeSent?: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      phone: true,
      twoFactorSecret: true,
      twoFactorEnabled: true,
      twoFactorConfirmedAt: true,
      twoFactorMethod: true,
      twoFactorPhone: true,
    },
  });
  if (!user) redirect("/login");
  const { error, setup, smsSetup, disableCodeSent } = await searchParams;
  let secret: string | null = null;
  if (user.twoFactorSecret && !user.twoFactorEnabled) {
    try { secret = decryptTotpSecret(user.twoFactorSecret); } catch { secret = null; }
  }
  const uri = secret ? getTotpUri(user.email, secret) : null;
  const accountHref = session.user.role === "Super Admin" ? "/app/platform/account" : "/app/account";

  const smsEnrollmentPending = !user.twoFactorEnabled && smsSetup === "1"
    ? await hasPendingSmsOtpChallenge(session.user.id, "ENROLL_VERIFY_PHONE")
    : false;
  const smsDisablePending = user.twoFactorEnabled && user.twoFactorMethod === "SMS" && disableCodeSent === "1"
    ? await hasPendingSmsOtpChallenge(session.user.id, "DISABLE")
    : false;

  return <div className="space-y-6">
    <PageHeader title="Account security" description="Protect your Rock Frost account with an authenticator app or SMS codes." />
    {error && errors[error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errors[error]}</p> : null}
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Two-factor authentication</CardTitle><CardDescription>Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) or receive a code by text message.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        {user.twoFactorEnabled ? <>
          <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">
            2FA is active via {user.twoFactorMethod === "SMS" ? `SMS to ${user.twoFactorPhone}` : "an authenticator app"}
            {user.twoFactorConfirmedAt ? ` since ${user.twoFactorConfirmedAt.toLocaleDateString()}` : ""}. Every new sign-in requires a code.
          </p>
          {user.twoFactorMethod === "SMS" ? (
            smsDisablePending ? (
              <form action={disableTwoFactor} className="space-y-3 rounded-md border p-4">
                <p className="font-medium">Disable 2FA</p>
                <p className="text-sm text-muted-foreground">Enter the code we just texted you.</p>
                <div className="space-y-2"><Label htmlFor="disable-password">Current password</Label><Input id="disable-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
                <div className="space-y-2"><Label htmlFor="disable-code">SMS code</Label><Input id="disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>
                <Button type="submit" variant="destructive">Disable two-factor authentication</Button>
              </form>
            ) : (
              <form action={requestDisableSmsCode} className="space-y-3 rounded-md border p-4">
                <p className="font-medium">Disable 2FA</p>
                <div className="space-y-2"><Label htmlFor="request-disable-password">Current password</Label><Input id="request-disable-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
                <Button type="submit" variant="outline">Send disable code by SMS</Button>
              </form>
            )
          ) : (
            <form action={disableTwoFactor} className="space-y-3 rounded-md border p-4">
              <p className="font-medium">Disable 2FA</p>
              <div className="space-y-2"><Label htmlFor="disable-password">Current password</Label><Input id="disable-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
              <div className="space-y-2"><Label htmlFor="disable-code">Authenticator code</Label><Input id="disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>
              <Button type="submit" variant="destructive">Disable two-factor authentication</Button>
            </form>
          )}
        </> : secret ? <>
          {setup ? <p className="rounded-md bg-primary/10 p-3 text-sm">Add the account using the key below, then confirm with the current six-digit code.</p> : null}
          <div className="space-y-2 rounded-md border bg-muted/30 p-4"><p className="text-sm font-medium">Manual setup key</p><code className="block break-all rounded bg-background p-3 text-sm">{secret}</code><p className="text-xs text-muted-foreground">Setup URI for compatible password managers:</p><code className="block break-all text-xs text-muted-foreground">{uri}</code></div>
          <form action={confirmTwoFactorSetup} className="space-y-3">
            <div className="space-y-2"><Label htmlFor="confirm-code">Six-digit code</Label><Input id="confirm-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>
            <Button type="submit">Confirm and enable 2FA</Button>
          </form>
          <form action={beginTwoFactorSetup} className="space-y-3 border-t pt-4">
            <Label htmlFor="regenerate-password">Generate a different key using your current password</Label><div className="flex gap-2"><Input id="regenerate-password" name="currentPassword" type="password" autoComplete="current-password" required /><Button type="submit" variant="outline">Regenerate</Button></div>
          </form>
        </> : smsEnrollmentPending ? <>
          <p className="rounded-md bg-primary/10 p-3 text-sm">Enter the six-digit code we just texted you to finish enabling SMS 2FA.</p>
          <form action={confirmSmsTwoFactorSetup} className="space-y-3">
            <div className="space-y-2"><Label htmlFor="confirm-sms-code">Six-digit code</Label><Input id="confirm-sms-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>
            <Button type="submit">Confirm and enable 2FA</Button>
          </form>
        </> : <div className="grid gap-4 sm:grid-cols-2">
          <form action={beginTwoFactorSetup} className="space-y-3 rounded-md border p-4">
            <p className="font-medium">Authenticator app</p>
            <p className="text-sm text-muted-foreground">Confirm your current password before generating a private authenticator key.</p>
            <div className="space-y-2"><Label htmlFor="setup-password">Current password</Label><Input id="setup-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <Button type="submit">Set up with an authenticator app</Button>
          </form>
          <form action={beginSmsTwoFactorSetup} className="space-y-3 rounded-md border p-4">
            <p className="font-medium">Text message (SMS)</p>
            <p className="text-sm text-muted-foreground">We will text a verification code to confirm the number before turning this on.</p>
            <div className="space-y-2"><Label htmlFor="sms-setup-password">Current password</Label><Input id="sms-setup-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="space-y-2"><Label htmlFor="sms-setup-phone">Phone number</Label><Input id="sms-setup-phone" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone ?? ""} placeholder="0241234567" required /></div>
            <Button type="submit" variant="outline">Set up with SMS</Button>
          </form>
        </div>}
        <Link href={accountHref} className="inline-block text-sm text-muted-foreground underline">Back to profile</Link>
      </CardContent>
    </Card>
  </div>;
}
