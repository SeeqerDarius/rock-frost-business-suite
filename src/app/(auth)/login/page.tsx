"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const NOTICE_MESSAGES: Record<string, string> = {
  reset: "Your password has been reset. Sign in with your new password.",
  activated: "Your account is now active. Sign in to continue.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-invite": "That invitation link is invalid.",
  "expired-invite": "That invitation link has expired or was already used.",
};

function LoginNotices() {
  const searchParams = useSearchParams();
  const noticeKey = searchParams.get("reset") ? "reset" : searchParams.get("activated") ? "activated" : null;
  const notice = noticeKey ? NOTICE_MESSAGES[noticeKey] : null;
  const urlError = searchParams.get("error");
  const urlErrorMessage = urlError ? ERROR_MESSAGES[urlError] : null;

  if (!notice && !urlErrorMessage) return null;

  return (
    <>
      {notice ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </div>
      ) : null}
      {urlErrorMessage ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {urlErrorMessage}
        </div>
      ) : null}
    </>
  );
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      callbackUrl: "/app/dashboard",
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      setIsSubmitting(false);
      return;
    }

    window.location.href = result?.url ?? "/app/dashboard";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your credentials to access your workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Suspense fallback={null}>
            <LoginNotices />
          </Suspense>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
