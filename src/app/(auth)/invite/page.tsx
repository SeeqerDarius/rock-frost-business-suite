import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getServerAuthSession } from "@/lib/auth/session";
import { previewInvitation, InvitationAcceptError } from "@/lib/auth/invitations";
import { acceptInvite, acceptInviteExisting } from "@/lib/auth/actions";

const ERROR_MESSAGES: Record<string, string> = {
  "too-short": "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
  invalid: "This invitation link is invalid.",
  "already-accepted": "This invitation has already been accepted.",
  revoked: "This invitation has been revoked.",
  expired: "This invitation link has expired. Ask whoever invited you to send a new one.",
  "existing-account": "This invitation is for an account that already exists. Log in and try the link again.",
  "not-active": "This invitation's account isn't active yet.",
  "wrong-account": "You're signed in as a different account than this invitation was sent to. Sign out and try again.",
};

/**
 * Bound to one specific OrganizationMember via a hashed, single-purpose
 * token (see src/lib/auth/invitations.ts) — not looked up by email, which
 * previously let one organization's invite link activate every other
 * INVITED membership the same user had. Two distinct accept paths:
 * a brand-new user sets a password here; an existing active user being
 * invited to an additional organization never has their password touched —
 * they must already be signed in as that exact account (or are sent to
 * /login with a callbackUrl back here) before the membership activates.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
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

  let invitation: Awaited<ReturnType<typeof previewInvitation>>;
  try {
    invitation = await previewInvitation(token);
  } catch (previewError) {
    const reason = previewError instanceof InvitationAcceptError ? previewError.reason : "invalid";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation not available</CardTitle>
          <CardDescription>{ERROR_MESSAGES[reason] ?? ERROR_MESSAGES.invalid}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!invitation.isNewUser) {
    const session = await getServerAuthSession();
    const isSignedInAsInvitee = session?.user?.email?.toLowerCase() === invitation.email.toLowerCase();

    return (
      <Card>
        <CardHeader>
          <CardTitle>Join {invitation.organizationName}</CardTitle>
          <CardDescription>
            {isSignedInAsInvitee
              ? `Confirm joining ${invitation.organizationName} as ${invitation.email}.`
              : `This invitation is for the existing account ${invitation.email}. Log in to accept it.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && ERROR_MESSAGES[error] ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ERROR_MESSAGES[error]}
            </div>
          ) : null}
          {isSignedInAsInvitee ? (
            <form action={acceptInviteExisting}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" className="w-full">
                Accept invitation
              </Button>
            </form>
          ) : (
            <Button
              className="w-full"
              nativeButton={false}
              render={<Link href={`/login?callbackUrl=${encodeURIComponent(`/invite?token=${token}`)}`} />}
            >
              Log in to accept
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your account</CardTitle>
        <CardDescription>Choose a password to activate {invitation.email}.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && ERROR_MESSAGES[error] ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ERROR_MESSAGES[error]}
          </div>
        ) : null}
        <form action={acceptInvite} className="space-y-4">
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
