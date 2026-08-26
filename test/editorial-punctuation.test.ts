import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:css|rs|ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return files.flat();
}

/**
 * Strips // line comments and /* block comments (including JSDoc) from TS/TSX/CSS
 * source, tracking block-comment state across line boundaries, so a codebase that
 * legitimately uses em dashes in developer comments doesn't fail this check - only
 * an em dash that survives outside any comment is a real customer-facing violation.
 *
 * This is a line-based heuristic, not a real parser: a string literal that itself
 * contains a literal "//" (e.g. a URL) on the same physical line as a later em dash
 * could in principle be mis-stripped. No such case exists in this codebase as of the
 * 2026-08-25 audit that introduced this test (every flagged occurrence was verified
 * by hand first). If a future change legitimately needs an em dash right after a
 * "//"-containing string on one line, split it onto its own line rather than relying
 * on this heuristic being perfect.
 */
function stripComments(source: string): string {
  const lines = source.split("\n");
  let inBlock = false;
  const kept: string[] = [];
  for (const line of lines) {
    let result = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) { i = line.length; break; }
        inBlock = false;
        i = end + 2;
        continue;
      }
      const blockStart = line.indexOf("/*", i);
      const lineStart = line.indexOf("//", i);
      if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
        result += line.slice(i, lineStart);
        break;
      }
      if (blockStart !== -1) {
        result += line.slice(i, blockStart);
        inBlock = true;
        i = blockStart + 2;
        continue;
      }
      result += line.slice(i);
      break;
    }
    kept.push(result);
  }
  return kept.join("\n");
}

describe("editorial punctuation", () => {
  it("does not use the prohibited em dash anywhere in the public marketing site (strictest: not even in comments)", async () => {
    const roots = [
      path.join(process.cwd(), "src", "app", "(public)"),
      path.join(process.cwd(), "src", "components", "marketing"),
    ];
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const violations = [];

    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("—")) violations.push(file);
    }

    expect(violations).toEqual([]);
  }, 15_000);

  it("does not use the prohibited em dash in any customer/user-facing string across the whole app (comments excluded)", async () => {
    // Broader than the public-site check above: this covers every module, platform,
    // and shared-component surface, not just marketing. Comments are allowed to keep
    // using em dashes (developer documentation is not customer-facing per AGENTS.md's
    // own rule); only an em dash surviving comment-stripping is flagged. Added after a
    // real production incident where em dashes shipped as literal "no value" table-cell
    // placeholders (`field ?? "—"`) and inside user-facing error/description strings,
    // undetected because the older test above only ever covered the public site.
    const files = await sourceFiles(path.join(process.cwd(), "src"));
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (stripComments(source).includes("—")) violations.push(file);
    }

    expect(violations).toEqual([]);
  }, 30_000);
});
