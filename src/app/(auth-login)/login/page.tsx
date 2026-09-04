"use client";

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Check, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import { Logo } from "@/components/layout/logo";
import { getAccountLockStatus, requestLoginSmsCode } from "@/lib/auth/actions";
import { buildSurfaceUrl, classifyAppSurface, type AppSurface } from "@/lib/app-surfaces";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { verifyLoginBotProtection } from "@/lib/auth/actions";
import { catalogueModuleRegistry } from "@/platform/modules/registry";
import { cn } from "@/lib/utils";
import styles from "./login.module.css";

const NOTICE_MESSAGES: Record<string, string> = {
  reset: "Your password has been reset. Sign in with your new password.",
  activated: "Your account is now active. Sign in to continue.",
  "2fa-enabled": "Two-factor authentication is enabled. Sign in again with your authenticator code.",
  "2fa-disabled": "Two-factor authentication is disabled. Sign in to continue.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-invite": "That invitation link is invalid.",
  "expired-invite": "That invitation link has expired or was already used.",
};

const subscribeToHostname = () => () => {};

/* ---------------- Illustration panel: 3D scene + cycling module chips ---------------- */

const MODULE_NAMES = catalogueModuleRegistry.map((module_) => module_.name);

const CHIP_SLOTS = [
  { className: styles.chipA, delay: "0.95s", floatDuration: "5.6s", floatDelay: "1.9s", intervalMs: 3600 },
  { className: styles.chipB, delay: "1.1s", floatDuration: "6.2s", floatDelay: "2.1s", intervalMs: 4200 },
  { className: styles.chipC, delay: "1.25s", floatDuration: "5s", floatDelay: "2.3s", intervalMs: 4800 },
] as const;

function ModuleChips() {
  const [indices, setIndices] = useState(() => CHIP_SLOTS.map((_, slot) => slot % MODULE_NAMES.length));
  const [swapping, setSwapping] = useState(() => CHIP_SLOTS.map(() => false));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers = CHIP_SLOTS.map((slot, slotIndex) =>
      window.setInterval(() => {
        setSwapping((current) => current.map((value, i) => (i === slotIndex ? true : value)));
        window.setTimeout(() => {
          setIndices((current) =>
            current.map((value, i) => (i === slotIndex ? (value + CHIP_SLOTS.length) % MODULE_NAMES.length : value)),
          );
          setSwapping((current) => current.map((value, i) => (i === slotIndex ? false : value)));
        }, 350);
      }, slot.intervalMs),
    );

    return () => { timers.forEach((timer) => window.clearInterval(timer)); };
  }, []);

  return (
    <>
      {CHIP_SLOTS.map((slot, i) => (
        <span
          key={slot.className}
          className={cn(styles.moduleChip, slot.className)}
          style={{
            ["--delay" as string]: slot.delay,
            ["--float-duration" as string]: slot.floatDuration,
            ["--float-delay" as string]: slot.floatDelay,
          }}
        >
          <span className={cn(styles.chipText, swapping[i] && styles.chipSwapping)}>{MODULE_NAMES[indices[i]]}</span>
        </span>
      ))}
    </>
  );
}

const BAR_HEIGHTS = [42, 68, 52, 88, 60];

function IllustrationScene() {
  return (
    <div className={cn("relative flex flex-1 items-center justify-center", styles.sceneWrap)}>
      <div className={styles.scene}>
        <div
          className={cn(styles.tile, styles.tileMain)}
          style={{
            ["--rx" as string]: "10deg", ["--ry" as string]: "-16deg", ["--tz" as string]: "0px",
            ["--delay" as string]: "0.35s", ["--float-duration" as string]: "6s", ["--float-delay" as string]: "1.3s",
          }}
        >
          <div className={styles.dots}><span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} /></div>
          <div className={styles.bars}>
            {BAR_HEIGHTS.map((height, i) => (
              <i key={i} className={styles.bar} style={{ height: `${height}%`, ["--bar-delay" as string]: `${0.75 + i * 0.1}s` }} />
            ))}
          </div>
        </div>

        <div
          className={cn(styles.tile, styles.tileLock)}
          style={{
            ["--rx" as string]: "8deg", ["--ry" as string]: "18deg", ["--tz" as string]: "60px",
            ["--delay" as string]: "0.55s", ["--float-duration" as string]: "5.2s", ["--float-delay" as string]: "1.5s",
          }}
        >
          <Lock className="size-8" strokeWidth={1.8} aria-hidden="true" />
        </div>

        <div
          className={cn(styles.tile, styles.tileCheck)}
          style={{
            ["--rx" as string]: "-6deg", ["--ry" as string]: "-10deg", ["--tz" as string]: "90px",
            ["--delay" as string]: "0.75s", ["--float-duration" as string]: "4.6s", ["--float-delay" as string]: "1.7s",
          }}
        >
          <Check className="size-8" strokeWidth={2.6} aria-hidden="true" />
        </div>

        <ModuleChips />
      </div>
    </div>
  );
}

/* ---------------- Sign-in form (behavior unchanged from the previous page) ---------------- */

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingSmsCode, setIsSendingSmsCode] = useState(false);
  const [smsCodeStatus, setSmsCodeStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const surface = useSyncExternalStore<AppSurface>(
    subscribeToHostname,
    () => classifyAppSurface(window.location.hostname),
    () => "unknown",
  );

  const securityNotice = searchParams.get("security");
  const noticeKey = securityNotice && NOTICE_MESSAGES[securityNotice]
    ? securityNotice
    : searchParams.get("reset") ? "reset" : searchParams.get("activated") ? "activated" : null;
  const notice = noticeKey ? NOTICE_MESSAGES[noticeKey] : null;
  const urlError = searchParams.get("error");
  const invitedEmail = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const [email, setEmail] = useState(invitedEmail);
  const urlErrorMessage = urlError ? ERROR_MESSAGES[urlError] : null;
  const requestedCallbackUrl = searchParams.get("callbackUrl") || "/app";
  const callbackPath =
    requestedCallbackUrl.startsWith("/") && !requestedCallbackUrl.startsWith("//")
      ? requestedCallbackUrl
      : "/app";
  const tenantLoginUrl = buildSurfaceUrl("tenant", "/login").toString();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    const botCheck = await verifyLoginBotProtection(formData);
    if (!botCheck) {
      setError("We couldn't verify this sign-in attempt. Refresh the page and try again.");
      setIsSubmitting(false);
      return;
    }

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

  async function handleSendSmsCode() {
    const formEl = formRef.current;
    if (!formEl) return;
    const formData = new FormData(formEl);
    const emailValue = String(formData.get("email") ?? "").trim().toLowerCase();
    const passwordValue = String(formData.get("password") ?? "");
    if (!emailValue || !passwordValue) {
      setSmsCodeStatus("Enter your email and password first.");
      return;
    }

    setIsSendingSmsCode(true);
    setSmsCodeStatus(null);
    const status = await requestLoginSmsCode(emailValue, passwordValue);
    setIsSendingSmsCode(false);

    if (status.locked) {
      setError(`Too many failed attempts. Try again in ${status.minutesLeft} minute${status.minutesLeft === 1 ? "" : "s"}.`);
      return;
    }
    setSmsCodeStatus("If this account uses SMS two-factor authentication, a code was just sent.");
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
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
      ) : null}

      <div className={cn("flex flex-col gap-1.5", styles.formField)} style={{ animationDelay: "0.35s" }}>
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email"
            value={email} onChange={(event) => setEmail(event.target.value)} required
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className={cn("flex flex-col gap-1.5", styles.formField)} style={{ animationDelay: "0.45s" }}>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href={email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}` : "/forgot-password"}
            className="text-xs font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-11 pl-9" />
        </div>
      </div>

      <div className={cn("flex flex-col gap-1.5", styles.formField)} style={{ animationDelay: "0.5s" }}>
        <div className="flex items-center justify-between">
          <Label htmlFor="twoFactorCode">Two-factor code</Label>
          <button
            type="button"
            onClick={handleSendSmsCode}
            disabled={isSendingSmsCode}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isSendingSmsCode ? "Sending..." : "Send code by SMS"}
          </button>
        </div>
        <div className="relative">
          <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="twoFactorCode" name="twoFactorCode" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" placeholder="Authenticator app or SMS code, if 2FA is enabled"
            className="h-11 pl-9"
          />
        </div>
        {smsCodeStatus ? <p className="text-xs text-muted-foreground">{smsCodeStatus}</p> : null}
      </div>

      <TurnstileWidget action="login" />

      <Button
        type="submit"
        disabled={isSubmitting}
        size="lg"
        className={cn("h-11 w-full text-base", styles.formField)}
        style={{ animationDelay: "0.6s" }}
      >
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isSubmitting ? "Signing in..." : "Log In"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className={cn("relative hidden flex-col justify-between overflow-hidden p-8 lg:flex lg:p-14", styles.illustrationPanel)}>
        <div className={cn(styles.blob, styles.blobA)} />
        <div className={cn(styles.blob, styles.blobB)} />

        <IllustrationScene />

        <div className={cn("max-w-md", styles.panelCopy)}>
          <span className="mb-3 inline-block text-xs font-semibold tracking-[0.16em] text-white/85 uppercase">Admin Portal</span>
          <h2 className="mb-3 text-2xl leading-tight font-bold text-balance text-white lg:text-3xl">Run every module from one place.</h2>
          <p className="text-white/80">
            Fleet, Accounting, School, HR, and more: manage your organization&rsquo;s entire Rock Frost workspace from a
            single sign-in.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-8" />
          <h1 className="mb-1 text-2xl font-bold text-balance">Welcome back</h1>
          <p className="mb-7 text-sm text-muted-foreground">Sign in to manage your organization&rsquo;s workspace.</p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected by Rock Frost security &middot; Need help? Contact your administrator
          </p>
        </div>
      </section>
    </div>
  );
}
