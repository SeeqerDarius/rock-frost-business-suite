export const BUSINESS_MOTIVATIONS = [
  "Small improvements compound into strong businesses.",
  "Clear records lead to clearer decisions.",
  "Today’s disciplined work builds tomorrow’s growth.",
  "Progress becomes visible when the numbers are trusted.",
  "Consistent service turns customers into advocates.",
  "Strong operations create room for better ideas.",
] as const;

export const MOTIVATION_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function hourInTimezone(now: Date, timezone: string | null | undefined) {
  const safeTimezone = timezone?.trim() || "Africa/Accra";
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: safeTimezone }).format(now));
  } catch {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Accra" }).format(now));
  }
}

export function safeFirstName(firstName?: string | null, fullName?: string | null) {
  const candidate = firstName?.trim() || fullName?.trim().split(/\s+/)[0] || "";
  return /^[\p{L}][\p{L}' -]{0,49}$/u.test(candidate) ? candidate : null;
}

export function workspaceGreeting(now: Date, timezone?: string | null, firstName?: string | null, fullName?: string | null) {
  const greeting = greetingForHour(hourInTimezone(now, timezone));
  const name = safeFirstName(firstName, fullName);
  return name ? `${greeting}, ${name}` : greeting;
}

export function shouldShowMotivation(lastShownAt: number | null, now: number) {
  return lastShownAt === null || now - lastShownAt >= MOTIVATION_INTERVAL_MS;
}
