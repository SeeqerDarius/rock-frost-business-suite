import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/lib/auth/actions";

const ERROR_MESSAGES: Record<string, string> = {
  "too-short": "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
};

/**
 * Accepts an organization invitation and sets an initial password. The
 * invitation itself (User + OrganizationMember rows, both status INVITED,
 * plus a token issued via issueInviteToken) is created by an administrator —
 * building that admin-facing "send an invite" UI is Phase 4 (Platform
 * Workspace / user management) scope, not this phase.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; error?: string }>;
}) {
  const { email, token, error } = await searchParams;

  if (!email || !token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invitation link</CardTitle>
          <CardDescription>
            This invitation link is missing required information. Ask whoever invited you to send a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your account</CardTitle>
        <CardDescription>Choose a password to activate {email}.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && ERROR_MESSAGES[error] ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ERROR_MESSAGES[error]}
          </div>
        ) : null}
        <form action={acceptInvite} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <Button type="submit" className="w-full">
            Activate account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
