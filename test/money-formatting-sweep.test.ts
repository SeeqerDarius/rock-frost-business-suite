import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/currency";
import { createOrganizationFormatter, organizationNumberLocale } from "@/lib/org-format";

describe("organization money formatting", () => {
  it("uses the organization's number format, then its locale, then the currency's usual locale", () => {
    expect(organizationNumberLocale({ currency: "EUR", locale: "fr-FR", numberFormat: "DOT_COMMA" })).toBe("de-DE");
    expect(organizationNumberLocale({ currency: "EUR", locale: "fr-FR", numberFormat: "LOCALE" })).toBe("fr-FR");
    expect(organizationNumberLocale({ currency: "GHS" })).toBe("en-GH");
    expect(organizationNumberLocale(null)).toBe("en-GH");
  });

  it("formats the same as the organization formatter when given the organization locale", () => {
    const organization = { currency: "CHF", locale: "de-CH", numberFormat: "APOSTROPHE_DOT" };
    const value = 1234567.5;
    expect(formatMoney(value, organization.currency, organizationNumberLocale(organization))).toBe(createOrganizationFormatter(organization).money(value));
  });

  it("keeps Ghana organizations' output unchanged", () => {
    expect(createOrganizationFormatter({ currency: "GHS" }).money(1500)).toBe(formatMoney(1500, "GHS"));
  });
});

/**
 * Regression guard for the formatting sweep: application code must not fall
 * back to formatMoney's GHS default or ignore the organization number format.
 * Pages format money with createOrganizationFormatter(...).money, or pass the
 * organization locale (organizationNumberLocale) as formatMoney's third argument.
 */
describe("formatting sweep coverage", () => {
  // Deliberate exceptions: platform billing shows Rock Frost's own GHS prices;
  // Contracts tabs receive an organization formatter as a prop named formatMoney;
  // service error messages use the document or base currency with its usual locale.
  const ALLOWED_TWO_ARGUMENT = new Set([
    "src/app/app/platform/billing/page.tsx",
    "src/app/app/platform/dashboard/page.tsx",
    "src/app/app/contracts/_components/integration-tabs.tsx",
    "src/app/app/contracts/_components/lifecycle-tabs.tsx",
    "src/modules/accounting/service.ts",
    "src/modules/installment/service.ts",
  ]);

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  function argumentCount(source: string, openParen: number) {
    let depth = 0;
    let commas = 0;
    for (let index = openParen + 1; index < source.length; index++) {
      const char = source[index];
      if ("([{".includes(char)) depth++;
      else if (")]}".includes(char)) { if (depth === 0) break; depth--; }
      else if (char === "," && depth === 0) commas++;
    }
    return commas + 1;
  }

  it("never calls formatMoney without a currency, and passes the organization locale outside the allowed exceptions", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const relative = file.split(path.sep).join("/");
      if (relative === "src/lib/currency.ts") continue;
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?<![\w.])formatMoney\(/g)) {
        if (source.slice(Math.max(0, match.index! - 9), match.index!).endsWith("function ")) continue;
        const count = argumentCount(source, match.index! + "formatMoney".length);
        if (count < 2 || (count < 3 && !ALLOWED_TWO_ARGUMENT.has(relative))) offenders.push(`${relative} (${count} argument${count === 1 ? "" : "s"})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
