/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { dirname, extname, join, resolve } from "path";
import { fileURLToPath } from "url";

const thisFilePath = fileURLToPath(import.meta.url);
const externalRoot = dirname(thisFilePath);

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(entryPath));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === ".ts") {
      files.push(entryPath);
    }
  }

  return files;
}

function resolveRelativeImport(fromFile: string, specifier: string): string {
  const fromDir = dirname(fromFile);
  const resolvedPath = resolve(fromDir, specifier);

  const candidates = [resolvedPath, `${resolvedPath}.ts`, join(resolvedPath, "index.ts")];

  for (const candidate of candidates) {
    try {
      // If this doesn't throw, the file exists.
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // Continue trying candidate paths.
    }
  }

  return resolvedPath;
}

describe("external import boundaries", () => {
  test("all imports stay within src/external", () => {
    const files = listTsFiles(externalRoot);
    const fromPattern = /\bfrom\s+["']([^"']+)["']/g;
    const sideEffectImportPattern = /\bimport\s+["']([^"']+)["']/g;
    const violations: string[] = [];

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf8");
      const imports = [
        ...[...content.matchAll(fromPattern)].map(match => match[1]),
        ...[...content.matchAll(sideEffectImportPattern)].map(match => match[1]),
      ];

      for (const specifier of imports) {
        if (specifier === "@platform" || specifier === "@touch-grass-bible" || specifier.startsWith("src/")) {
          violations.push(`${filePath}: forbidden alias import "${specifier}"`);
          continue;
        }

        if (!specifier.startsWith(".")) {
          continue;
        }

        const resolvedImport = resolveRelativeImport(filePath, specifier);
        if (!resolvedImport.startsWith(externalRoot)) {
          violations.push(
            `${filePath}: relative import "${specifier}" resolves outside src/external (${resolvedImport})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
