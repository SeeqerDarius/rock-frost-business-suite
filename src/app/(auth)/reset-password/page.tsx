import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/auth/actions";

const ERROR_MESSAGES: Record<string, string> = {
  "too-short": "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; error?: string }>;
}) {
  const { email, token, error } = await searchParams;

  if (!email || !token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid reset link</CardTitle>
          <CardDescription>
            This password reset link is missing required information. Request a new one from the sign-in page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Set a new password for {email}.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && ERROR_MESSAGES[error] ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ERROR_MESSAGES[error]}
          </div>
        ) : null}
        <form action={resetPassword} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <Button type="submit" className="w-full">
            Reset password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
