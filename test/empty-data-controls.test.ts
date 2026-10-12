import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasNonZeroValues } from "@/lib/chart-data";

/**
 * Controls must not be offered over data that does not exist.
 *
 * Two separate versions of the same defect were shipped, both invisible to a
 * build and to every existing test, because in both cases the component
 * rendered perfectly - over nothing.
 *
 * 1. A trend series for a period with no activity is not an empty array. The
 *    buckets are all present and each holds 0, which is finite, so a presence
 *    check passes. The Overview dashboard of a new organization drew a flat
 *    GHS 0 revenue line under a three-way period switcher and a three-way
 *    chart-style toggle: six controls, nothing to control.
 *
 * 2. School's `RecordSearch` was rendered unconditionally, so a school with
 *    no students was offered "Find a student" reading "Showing 0 of 0
 *    students" directly above the notice telling it to go and admit one.
 */

describe("hasNonZeroValues decides whether there is anything to chart", () => {
  const revenue = ["revenue"];

  it("rejects the all-zero buckets a quiet period actually produces", () => {
    // Not [] - this is the shape buildTrendBuckets returns with no activity,
    // and the shape that fooled the old check.
    expect(hasNonZeroValues([{ label: "May", revenue: 0 }, { label: "Jun", revenue: 0 }], revenue)).toBe(false);
  });

  it("accepts a series with any activity at all, however small or late", () => {
    expect(hasNonZeroValues([{ label: "May", revenue: 0 }, { label: "Jun", revenue: 0.5 }], revenue)).toBe(true);
  });

  it("treats a negative value as data, because an expense or a loss is data", () => {
    expect(hasNonZeroValues([{ label: "May", revenue: -2400 }], revenue)).toBe(true);
  });

  it("ignores absent and unparseable values instead of counting them as activity", () => {
    expect(hasNonZeroValues([{ label: "May" }, { label: "Jun", revenue: "" }], revenue)).toBe(false);
    expect(hasNonZeroValues([{ label: "May", revenue: "not a number" }], revenue)).toBe(false);
  });

  it("looks across every requested key, so one live series is enough", () => {
    expect(hasNonZeroValues([{ label: "May", income: 0, expenses: 820 }], ["income", "expenses"])).toBe(true);
    expect(hasNonZeroValues([{ label: "May", income: 0, expenses: 0 }], ["income", "expenses"])).toBe(false);
  });

  it("reports nothing to chart for no rows at all", () => {
    expect(hasNonZeroValues([], revenue)).toBe(false);
  });
});

describe("the chart components route their emptiness check through that rule", () => {
  const charts = readFileSync("src/components/dashboard/charts.tsx", "utf8");

  it("has no chart left deciding emptiness by presence of a finite number", () => {
    // The exact old predicate. It is worth naming: it reads as a careful
    // check and passes for every all-zero series there is.
    expect(charts).not.toContain("Number.isFinite(Number(row[s.key]))");
    expect(charts).not.toContain("Number.isFinite(Number(row[key]))");
    expect(charts).toContain('import { hasNonZeroValues } from "@/lib/chart-data";');
  });

  it("drops the period switcher when no granularity has anything, rather than offering three empty cuts", () => {
    // Both periodic wrappers, so the fix cannot be half-applied.
    expect(charts.match(/GRANULARITIES\.some\(\(granularity\) => hasNonZeroValues\(/g)).toHaveLength(2);
    expect(charts).toContain('<NoData label="No activity recorded yet." />');
  });

  it("still draws an all-zero series when a target gives it meaning", () => {
    // Zero against a target of GHS 50,000 is a real fact about a real
    // target, and the reference line plus the achievement row report it.
    expect(charts).toContain("const hasData = target !== undefined || hasNonZeroValues(");
  });
});

describe("School record searches are not offered over an empty dataset", () => {
  const recordSearch = readFileSync("src/components/school/record-search.tsx", "utf8");

  it("hides itself when the dataset is empty and no search is active", () => {
    expect(recordSearch).toContain("if (datasetSize === 0 && !searchIsActive) return null;");
  });

  it("keeps itself on screen when a search is active, so a search that matched nothing can be cleared", () => {
    // The matched count is zero exactly when a search found nothing, which
    // is the one time the search must not vanish: removing it would leave
    // editing the URL as the only way back to the full list.
    expect(recordSearch).toContain("const searchIsActive = isFiltered ?? Boolean(defaultValue?.trim());");
    expect(recordSearch).toContain("{searchIsActive ? (");
  });

  it("is given the unfiltered count by every page that searches students or books", () => {
    // datasetSize must never be handed the search-filtered total: that is
    // the bug this whole file exists for, one layer up.
    const pages = [
      "src/app/app/school/fees/page.tsx",
      "src/app/app/school/library/page.tsx",
      "src/app/app/school/exams/page.tsx",
      "src/app/app/school/classes/page.tsx",
      "src/app/app/school/transport/page.tsx",
    ];
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      const searches = source.match(/<RecordSearch[^>]*queryName="(studentQ|bookQ)"[\s\S]*?\/>/g) ?? [];
      expect(searches.length, `${page} should still have a student or book search`).toBeGreaterThan(0);
      for (const search of searches) {
        expect(search, `${page}: this search needs datasetSize={...totalWithoutQuery}`).toMatch(/datasetSize=\{[a-zA-Z]+\.totalWithoutQuery\}/);
      }
    }
  });

  it("does not offer Fees' New invoice while the page says setup is unfinished", () => {
    // The header offered this dialog unconditionally while the empty state
    // below gated the very same dialog, and the sibling fee-structure dialog
    // gated itself. Opening it produced a student select and a year select
    // with nothing in either.
    const fees = readFileSync("src/app/app/school/fees/page.tsx", "utf8");
    expect(fees).toContain("{students.totalWithoutQuery > 0 && years.length > 0 ? newInvoiceDialog : null}");
    expect(fees).not.toContain("actions={<>{newInvoiceDialog}");
  });

  it("does not let a filtered student list masquerade as an empty school", () => {
    const students = readFileSync("src/app/app/school/students/page.tsx", "utf8");
    // A bare `studentPage.total === 0` here means a search for a name nobody
    // has replaces the list with "No students yet" and takes the search box
    // with it, leaving the URL as the only way back.
    expect(students).toContain("const studentsFiltered = Boolean(query.q?.trim() || statusFilter);");
    expect(students).toContain("{studentPage.total === 0 && !studentsFiltered ? (");
  });
});

describe("the services behind those searches report the unfiltered size", () => {
  const service = readFileSync("src/modules/school/service.ts", "utf8");

  it("returns totalWithoutQuery from both choice listings", () => {
    expect(service).toContain("return { rows, total, totalWithoutQuery, take };");
    // Both listSchoolStudentChoices and listSchoolLibraryBookChoices.
    expect(service.match(/const totalWithoutQuery = /g)).toHaveLength(2);
  });
});
