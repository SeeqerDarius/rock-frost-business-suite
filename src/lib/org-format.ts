import { DATE_FORMATS, NUMBER_FORMATS, getDefaultLocaleForCurrency, isValidLocale, isValidTimeZone, type DateFormatKey, type NumberFormatKey } from "@/lib/localization";

/**
 * Organization presentation settings. Formatting only: exact accounting
 * values stay as decimals in the database and are never rounded or
 * re-derived here.
 */
export type OrganizationPresentation = {
  currency: string;
  locale: string;
  timezone: string;
  dateFormat: DateFormatKey;
  numberFormat: NumberFormatKey;
};

type PresentationSource = {
  currency?: string | null;
  locale?: string | null;
  timezone?: string | null;
  dateFormat?: string | null;
  numberFormat?: string | null;
};

export function resolveOrganizationPresentation(source: PresentationSource | null | undefined): OrganizationPresentation {
  const currency = source?.currency?.trim().toUpperCase() || "GHS";
  const locale = source?.locale && isValidLocale(source.locale) ? source.locale : getDefaultLocaleForCurrency(currency);
  const timezone = source?.timezone && isValidTimeZone(source.timezone) ? source.timezone : "UTC";
  const dateFormat = (source?.dateFormat && source.dateFormat in DATE_FORMATS ? source.dateFormat : "LOCALE") as DateFormatKey;
  const numberFormat = (source?.numberFormat && source.numberFormat in NUMBER_FORMATS ? source.numberFormat : "LOCALE") as NumberFormatKey;
  return { currency, locale, timezone, dateFormat, numberFormat };
}

function numberLocale(presentation: OrganizationPresentation): string {
  return NUMBER_FORMATS[presentation.numberFormat].locale ?? presentation.locale;
}

type Amount = { toString(): string } | number | string | null | undefined;

function toNumber(value: Amount): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

/** Date parts in the organization's timezone, never the server's. */
export function zonedDateParts(value: Date, timeZone: string): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function createOrganizationFormatter(source: PresentationSource | null | undefined) {
  const presentation = resolveOrganizationPresentation(source);
  const locale = numberLocale(presentation);

  function money(value: Amount, currency?: string | null): string {
    const code = currency?.trim().toUpperCase() || presentation.currency;
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(toNumber(value));
    } catch {
      return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(toNumber(value))} ${code}`;
    }
  }

  function number(value: Amount, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(locale, options).format(toNumber(value));
  }

  function date(value: Date | string | null | undefined): string {
    if (!value) return "";
    const instant = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(instant.getTime())) return "";
    if (presentation.dateFormat === "LOCALE") {
      return new Intl.DateTimeFormat(presentation.locale, { dateStyle: "medium", timeZone: presentation.timezone }).format(instant);
    }
    const { year, month, day } = zonedDateParts(instant, presentation.timezone);
    if (presentation.dateFormat === "MDY") return `${month}/${day}/${year}`;
    if (presentation.dateFormat === "YMD") return `${year}-${month}-${day}`;
    return `${day}/${month}/${year}`;
  }

  function dateTime(value: Date | string | null | undefined): string {
    if (!value) return "";
    const instant = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(instant.getTime())) return "";
    const time = new Intl.DateTimeFormat(presentation.locale, { timeStyle: "short", timeZone: presentation.timezone }).format(instant);
    return `${date(instant)} ${time}`;
  }

  return { presentation, money, number, date, dateTime };
}

export type OrganizationFormatter = ReturnType<typeof createOrganizationFormatter>;
