import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return files.flat();
}

describe("editorial punctuation", () => {
  it("does not use the prohibited em dash in shipped source", async () => {
    const roots = [
      path.join(process.cwd(), "src", "app", "(public)"),
      path.join(process.cwd(), "src", "components", "marketing"),
    ];
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const violations = [];

    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("\u2014")) violations.push(file);
    }

    expect(violations).toEqual([]);
  }, 15_000);
});
