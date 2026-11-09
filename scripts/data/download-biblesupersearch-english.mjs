#!/usr/bin/env node
/* eslint-disable security/detect-non-literal-fs-filename */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { get, request } from "node:https";

const LIST_URL = "https://api.biblesupersearch.com/api/bibles";
const DOWNLOAD_URL = "https://api.biblesupersearch.com/api/download";

function printUsage() {
  console.log(
    "Usage: node scripts/data/download-biblesupersearch-english.mjs [--output-dir <dir>] [--limit <number>]",
  );
  console.log(
    "Example: node scripts/data/download-biblesupersearch-english.mjs --output-dir data/translations",
  );
}

function normalizeBookName(bookName) {
  return String(bookName ?? "")
    .trim()
    .toUpperCase();
}

function normalizeVerseText(bookName, chapter, verse, text) {
  let normalized = String(text ?? "");

  normalized = normalized.replace(/^\s*¶\s*/u, "# ");
  normalized = normalized.replace(/\s*¶\s*/gu, "\n# ");

  return normalized;
}

function toBoolLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function requestJsonGet(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = get(url, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const payload = Buffer.concat(chunks).toString("utf8");
        const statusCode = res.statusCode ?? 0;

        if (statusCode < 200 || statusCode >= 300) {
          rejectPromise(
            new Error(`BibleSuperSearch list request failed (${statusCode}): ${payload.slice(0, 500)}`),
          );
          return;
        }

        try {
          resolvePromise(JSON.parse(payload));
        } catch (error) {
          rejectPromise(
            new Error(`Invalid JSON payload from BibleSuperSearch list endpoint: ${error.message}`),
          );
        }
      });
    });

    req.on("error", rejectPromise);
  });
}

function requestBibleJson(bibleCode) {
  return new Promise((resolvePromise, rejectPromise) => {
    const body = new URLSearchParams({
      bible: bibleCode,
      format: "json",
    }).toString();

    const req = request(
      DOWNLOAD_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body),
        },
      },
      res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          const statusCode = res.statusCode ?? 0;

          if (statusCode < 200 || statusCode >= 300) {
            rejectPromise(
              new Error(`BibleSuperSearch download failed (${statusCode}): ${payload.slice(0, 500)}`),
            );
            return;
          }

          try {
            const parsed = JSON.parse(payload);
            resolvePromise(parsed);
          } catch (error) {
            rejectPromise(
              new Error(`Invalid JSON payload from BibleSuperSearch download endpoint: ${error.message}`),
            );
          }
        });
      },
    );

    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

function convertToTranslationShape(downloadPayload) {
  if (!downloadPayload || !Array.isArray(downloadPayload.verses)) {
    throw new Error("Unexpected API response: missing verses array");
  }

  const translation = {};

  for (const entry of downloadPayload.verses) {
    const bookName = normalizeBookName(entry.book_name);
    const chapter = Number(entry.chapter);
    const verse = Number(entry.verse);
    const text = normalizeVerseText(bookName, chapter, verse, entry.text);

    if (
      !bookName ||
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      !Number.isInteger(verse) ||
      verse < 1 ||
      !Number.isInteger(verse) ||
      verse < 1
    ) {
      continue;
    }

    if (!translation[bookName]) {
      translation[bookName] = [null];
    }

    if (!translation[bookName][chapter]) {
      translation[bookName][chapter] = [null];
    }

    translation[bookName][chapter][verse] = text;
  }

  return translation;
}

function readMetadataIndex(metadataPath) {
  if (!existsSync(metadataPath)) {
    return {};
  }

  const raw = readFileSync(metadataPath, "utf8");
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function parseOptions(argv) {
  const options = {
    outputDir: resolve(join("data", "translations")),
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      options.help = true;
      return options;
    }
    if (token === "--output-dir") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --output-dir");
      options.outputDir = resolve(value);
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--limit must be a positive integer");
      }
      options.limit = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  mkdirSync(options.outputDir, { recursive: true });
  const metadataPath = join(options.outputDir, "metadata.json");
  const metadataIndex = readMetadataIndex(metadataPath);
  const response = await requestJsonGet(LIST_URL);
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error(`BibleSuperSearch list API error: ${response.errors.join("; ")}`);
  }

  const entries = Object.entries(response?.results ?? {});
  const english = entries
    .filter(([, info]) => String(info?.lang ?? "").toLowerCase() === "english")
    .filter(([, info]) => toBoolLike(info?.downloadable))
    .map(([module, info]) => ({
      module,
      code: String(info?.shortname ?? module).toUpperCase(),
    }));

  const selected = options.limit ? english.slice(0, options.limit) : english;
  console.log(`Found ${english.length} downloadable English Bible(s); downloading ${selected.length}.`);

  const failures = [];
  for (const item of selected) {
    try {
      console.log(`Downloading ${item.code} (module: ${item.module}) ...`);
      const rawPayload = await requestBibleJson(item.module);
      if (Array.isArray(rawPayload?.errors) && rawPayload.errors.length > 0) {
        throw new Error(`API error: ${rawPayload.errors.join("; ")}`);
      }
      const translation = convertToTranslationShape(rawPayload);
      const outputPath = join(options.outputDir, `${item.code}.json`);
      writeFileSync(outputPath, JSON.stringify(translation));
      metadataIndex[item.code] = rawPayload?.metadata ?? null;
      console.log(`Saved ${item.code} -> ${outputPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ code: item.code, message });
      console.error(`Failed ${item.code}: ${message}`);
    }
  }

  writeFileSync(metadataPath, JSON.stringify(metadataIndex, null, 2));
  console.log(`Updated metadata -> ${metadataPath}`);

  if (failures.length > 0) {
    throw new Error(`Failed ${failures.length}/${selected.length} download(s).`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
