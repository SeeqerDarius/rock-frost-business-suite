import { describe, expect, it } from "vitest";
import { parseCsv, findColumn, mapCsvRows, CsvParseError } from "@/lib/csv-import";

describe("parseCsv", () => {
  it("parses a header row and data rows into an array of objects", () => {
    const { headers, rows } = parseCsv("Date,Description,Amount\n2026-08-05,POS settlement,500.00\n2026-08-06,Rent,-1200.00\n");

    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toEqual([
      { Date: "2026-08-05", Description: "POS settlement", Amount: "500.00" },
      { Date: "2026-08-06", Description: "Rent", Amount: "-1200.00" },
    ]);
  });

  it("throws CsvParseError on a file with no data rows", () => {
    expect(() => parseCsv("Date,Description,Amount\n")).toThrow(CsvParseError);
  });

  it("throws CsvParseError on content that cannot be parsed as CSV", () => {
    expect(() => parseCsv('Date,Description,Amount\n"unterminated,quote,row\n')).toThrow(CsvParseError);
  });
});

describe("findColumn", () => {
  it("matches a header case-insensitively against a list of aliases", () => {
    expect(findColumn(["Transaction Date", "Narration", "Value"], ["date", "transaction date"])).toBe("Transaction Date");
  });

  it("returns null when no alias matches any header", () => {
    expect(findColumn(["Foo", "Bar"], ["date", "transaction date"])).toBeNull();
  });
});

describe("mapCsvRows", () => {
  it("collects a per-row error without aborting the rest of the batch", () => {
    const rows = [{ amount: "100" }, { amount: "not-a-number" }, { amount: "50" }];

    const result = mapCsvRows(rows, (row) => {
      const value = Number(row.amount);
      if (!Number.isFinite(value)) throw new Error(`"${row.amount}" is not a number.`);
      return value;
    });

    expect(result.imported).toEqual([100, 50]);
    expect(result.errors).toEqual([{ row: 3, message: '"not-a-number" is not a number.' }]);
  });
});
