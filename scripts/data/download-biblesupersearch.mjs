#!/usr/bin/env node
/* eslint-disable security/detect-non-literal-fs-filename */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { request } from "node:https";

const API_URL = "https://api.biblesupersearch.com/api/download";

function printUsage() {
  console.log("Usage: node scripts/data/download-biblesupersearch.mjs <BIBLE_CODE> [OUTPUT_PATH]");
  console.log("Example: node scripts/data/download-biblesupersearch.mjs YLT");
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

function requestBibleJson(bibleCode) {
  return new Promise((resolvePromise, rejectPromise) => {
    const body = new URLSearchParams({
      bible: bibleCode,
      format: "json",
    }).toString();

    const req = request(
      API_URL,
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
            rejectPromise(new Error(`Invalid JSON payload from BibleSuperSearch: ${error.message}`));
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

async function main() {
  const [firstArg, secondArg] = process.argv.slice(2);
  if (!firstArg || firstArg === "--help" || firstArg === "-h") {
    printUsage();
    process.exit(firstArg ? 0 : 1);
  }

  const bibleCode = firstArg.trim().toUpperCase();
  const outputPath = resolve(secondArg ?? join("data", "translations", `${bibleCode}.json`));
  const metadataPath = join(dirname(outputPath), "metadata.json");
  mkdirSync(dirname(outputPath), { recursive: true });

  console.log(`Downloading ${bibleCode} from ${API_URL} ...`);
  const rawPayload = await requestBibleJson(bibleCode);
  if (Array.isArray(rawPayload?.errors) && rawPayload.errors.length > 0) {
    throw new Error(`BibleSuperSearch API error: ${rawPayload.errors.join("; ")}`);
  }
  const translation = convertToTranslationShape(rawPayload);
  writeFileSync(outputPath, JSON.stringify(translation));
  const metadataIndex = readMetadataIndex(metadataPath);
  metadataIndex[bibleCode] = rawPayload?.metadata ?? null;
  writeFileSync(metadataPath, JSON.stringify(metadataIndex, null, 2));

  const bookCount = Object.keys(translation).length;
  console.log(`Saved ${bibleCode} (${bookCount} books) -> ${outputPath}`);
  console.log(`Updated metadata -> ${metadataPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
