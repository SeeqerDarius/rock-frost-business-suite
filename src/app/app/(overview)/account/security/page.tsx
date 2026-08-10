import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { decryptTotpSecret, getTotpUri } from "@/lib/auth/totp";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { beginTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor } from "./actions";

const errors: Record<string, string> = {
  password: "Your current password is incorrect.",
  code: "That authenticator code is invalid or expired.",
  setup: "The setup key is missing or invalid. Generate a new one.",
};

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; setup?: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, twoFactorSecret: true, twoFactorEnabled: true, twoFactorConfirmedAt: true },
  });
  if (!user) redirect("/login");
  const { error, setup } = await searchParams;
  let secret: string | null = null;
  if (user.twoFactorSecret && !user.twoFactorEnabled) {
    try { secret = decryptTotpSecret(user.twoFactorSecret); } catch { secret = null; }
  }
  const uri = secret ? getTotpUri(user.email, secret) : null;
  const accountHref = session.user.role === "Super Admin" ? "/app/platform/account" : "/app/account";

  return <div className="space-y-6">
    <PageHeader title="Account security" description="Protect your Rock Frost account with an authenticator app." />
    {error && errors[error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errors[error]}</p> : null}
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Two-factor authentication</CardTitle><CardDescription>Use Google Authenticator, Microsoft Authenticator, 1Password, Authy, or another TOTP-compatible app.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        {user.twoFactorEnabled ? <>
          <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">2FA is active{user.twoFactorConfirmedAt ? ` since ${user.twoFactorConfirmedAt.toLocaleDateString()}` : ""}. Every new sign-in requires a six-digit code.</p>
          <form action={disableTwoFactor} className="space-y-3 rounded-md border p-4">
            <p className="font-medium">Disable 2FA</p>
            <div className="space-y-2"><Label htmlFor="disable-password">Current password</Label><Input id="disable-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="space-y-2"><Label htmlFor="disable-code">Authenticator code</Label><Input id="disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>
            <Button type="submit" variant="destructive">Disable two-factor authentication</Button>
          </form>
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
        </> : <form action={beginTwoFactorSetup} className="space-y-3">
          <p className="text-sm text-muted-foreground">Confirm your current password before generating a private authenticator key.</p>
          <div className="space-y-2"><Label htmlFor="setup-password">Current password</Label><Input id="setup-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
          <Button type="submit">Set up two-factor authentication</Button>
        </form>}
        <Link href={accountHref} className="inline-block text-sm text-muted-foreground underline">Back to profile</Link>
      </CardContent>
    </Card>
  </div>;
}
