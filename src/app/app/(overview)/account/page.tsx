import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { changePassword, updateProfile } from "./actions";
import { ProfilePhotoForm } from "./profile-photo-form";

const ERRORS: Record<string, string> = {
  "invalid-profile": "Enter a valid name and email address.",
  "password-required": "Your current password is required to change your login email.",
  "email-in-use": "That email address is already in use.",
  "invalid-image": "Choose a JPG, PNG, or WebP image no larger than 1 MB.",
  "invalid-new-password": "New passwords must match and contain at least 8 characters.",
  "wrong-password": "The current password is incorrect.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true, image: true },
  });
  if (!user) redirect("/login");
  const { error, saved } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader title="Your profile" description="Manage your identity, photo, email, and password." />
      {error && ERRORS[error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error]}</p> : null}
      {saved ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">Your changes were saved.</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profile details</CardTitle><CardDescription>Your email is also your sign-in address.</CardDescription></CardHeader>
          <CardContent>
            <form action={updateProfile} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" name="name" defaultValue={user.name ?? ""} required /></div>
              <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} /></div>
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={user.email} required /></div>
              <div className="space-y-2"><Label htmlFor="profile-password">Current password (required only when changing email)</Label><Input id="profile-password" name="currentPassword" type="password" autoComplete="current-password" /></div>
              <Button type="submit">Save profile</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Profile picture</CardTitle><CardDescription>JPG, PNG, or WebP, up to 1 MB.</CardDescription></CardHeader>
            <CardContent><ProfilePhotoForm image={user.image} name={user.name} email={user.email} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Change password</CardTitle><CardDescription>Changing it signs out all existing sessions.</CardDescription></CardHeader>
            <CardContent>
              <form action={changePassword} className="space-y-4">
                <Input name="currentPassword" type="password" placeholder="Current password" autoComplete="current-password" required />
                <Input name="newPassword" type="password" placeholder="New password" autoComplete="new-password" minLength={8} required />
                <Input name="confirmation" type="password" placeholder="Confirm new password" autoComplete="new-password" minLength={8} required />
                <div className="flex items-center gap-3"><Button type="submit">Change password</Button><Link href="/forgot-password" className="text-sm text-muted-foreground underline">Forgot password?</Link></div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
