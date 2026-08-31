import "server-only";

import { parse } from "csv-parse/sync";

export class CsvParseError extends Error {}

const MAX_CSV_ROWS = 5000;

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

/** Parses a CSV file's full text into a header row and data rows. Shared by every
 * CSV-driven import in Accounting (bank statements, chart-of-accounts, contacts). */
export function parseCsv(content: string): CsvParseResult {
  let rows: Record<string, string>[];
  try {
    rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
  } catch (error) {
    throw new CsvParseError(error instanceof Error ? error.message : "The file could not be parsed as CSV.");
  }
  if (rows.length === 0) throw new CsvParseError("The file has no data rows.");
  if (rows.length > MAX_CSV_ROWS) throw new CsvParseError(`The file has more than ${MAX_CSV_ROWS} rows - split it into smaller files.`);
  return { headers: Object.keys(rows[0]), rows };
}

/** Finds the first header matching any of the given case-insensitive aliases -
 * the flexible "column mapping" step: bank export formats vary in header naming
 * (e.g. "Date" vs "Transaction Date"), so this auto-detects instead of asking the
 * importer to hand-map columns. */
export function findColumn(headers: string[], aliases: string[]): string | null {
  const byNormalizedKey = new Map(headers.map((header) => [header.trim().toLowerCase(), header]));
  for (const alias of aliases) {
    const match = byNormalizedKey.get(alias);
    if (match) return match;
  }
  return null;
}

export interface RowImportResult<T> {
  imported: T[];
  errors: { row: number; message: string }[];
}

/** Maps each data row through mapRow, collecting per-row errors instead of aborting
 * the whole import on the first bad row. `row` in each error is 1-indexed against
 * the original file, accounting for the header line. */
export function mapCsvRows<T>(rows: Record<string, string>[], mapRow: (row: Record<string, string>, index: number) => T): RowImportResult<T> {
  const imported: T[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, index) => {
    try {
      imported.push(mapRow(row, index));
    } catch (error) {
      errors.push({ row: index + 2, message: error instanceof Error ? error.message : "Invalid row." });
    }
  });
  return { imported, errors };
}
