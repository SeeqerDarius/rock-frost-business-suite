"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAccountLockStatus } from "@/lib/auth/actions";
import { buildSurfaceUrl, classifyAppSurface, type AppSurface } from "@/lib/app-surfaces";

const NOTICE_MESSAGES: Record<string, string> = {
  reset: "Your password has been reset. Sign in with your new password.",
  activated: "Your account is now active. Sign in to continue.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-invite": "That invitation link is invalid.",
  "expired-invite": "That invitation link has expired or was already used.",
};

const subscribeToHostname = () => () => {};

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const surface = useSyncExternalStore<AppSurface>(
    subscribeToHostname,
    () => classifyAppSurface(window.location.hostname),
    () => "unknown",
  );

  const noticeKey = searchParams.get("reset") ? "reset" : searchParams.get("activated") ? "activated" : null;
  const notice = noticeKey ? NOTICE_MESSAGES[noticeKey] : null;
  const urlError = searchParams.get("error");
  const urlErrorMessage = urlError ? ERROR_MESSAGES[urlError] : null;
  const requestedCallbackUrl = searchParams.get("callbackUrl") || "/app";
  const callbackPath =
    requestedCallbackUrl.startsWith("/") && !requestedCallbackUrl.startsWith("//")
      ? requestedCallbackUrl
      : "/app";
  const platformLoginUrl = buildSurfaceUrl("platform", "/login").toString();
  const tenantLoginUrl = buildSurfaceUrl("tenant", "/login").toString();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");

    const lockStatus = await getAccountLockStatus(email);
    if (lockStatus.locked) {
      setError(`Too many failed attempts. Try again in ${lockStatus.minutesLeft} minute${lockStatus.minutesLeft === 1 ? "" : "s"}.`);
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password: formData.get("password"),
      callbackUrl: new URL(callbackPath, window.location.origin).toString(),
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      setIsSubmitting(false);
      return;
    }

    window.location.href = result?.url ?? callbackPath;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {surface === "platform" ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          Platform owner sign-in. Tenant users should use{" "}
          <a href={tenantLoginUrl} className="font-medium text-primary underline-offset-4 hover:underline">
            the tenant workspace
          </a>.
        </div>
      ) : surface === "tenant" ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          Tenant workspace sign-in. Platform owners should use{" "}
          <a href={platformLoginUrl} className="font-medium text-primary underline-offset-4 hover:underline">
            Platform Administration
          </a>.
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
  );
}

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your credentials for this application workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
