import { readFileSync, writeFileSync } from "fs";
import { SingleBar } from "cli-progress";

const OLLAMA_URL = "http://localhost:11434/api/embeddings";
const MODEL = "nomic-embed-text";
const BIBLE_FILE = "data/translations/KJV.json";

async function embedVerse(text) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });
  if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
  const data = await response.json();
  return data.embedding;
}

async function processBible() {
  const bibleData = JSON.parse(readFileSync(BIBLE_FILE, "utf8"));
  const results = {};

  // 1. Calculate Total Verses (Skipping Nulls)
  let totalVerses = 0;
  for (let book in bibleData) {
    if (!bibleData[book]) continue;
    for (let chapter in bibleData[book]) {
      if (!bibleData[book][chapter]) continue;
      totalVerses += Object.keys(bibleData[book][chapter]).filter(
        v => bibleData[book][chapter][v] !== null,
      ).length;
    }
  }

  const progressBar = new SingleBar({
    format:
      "Progress |{bar}| {percentage}% | {value}/{total} Verses | ETA: {eta_formatted} | Elapsed: {duration_formatted}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(totalVerses, 0);
  const startTime = Date.now();
  let currentCount = 0;

  for (const book in bibleData) {
    if (!bibleData[book]) continue;
    results[book] = {};

    for (const chapter in bibleData[book]) {
      if (!bibleData[book][chapter]) continue; // Skip null chapters
      results[book][chapter] = {};

      for (const verse in bibleData[book][chapter]) {
        const verseText = bibleData[book][chapter][verse];

        // Skip if verse is null or empty string
        if (!verseText) continue;

        try {
          const vector = await embedVerse(verseText);
          results[book][chapter][verse] = {
            text: verseText,
            embedding: vector,
          };
        } catch (e) {
          // Log error but don't stop the script
          console.error(`\n[Error] ${book} ${chapter}:${verse} - ${e.message}`);
        }

        currentCount++;
        progressBar.update(currentCount);
      }
    }
  }

  progressBar.stop();
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n--- Processing Complete ---`);
  console.log(`Total Time: ${totalTime}s`);

  // Using a stream or writing synchronously
  writeFileSync("bible_with_embeddings.json", JSON.stringify(results));
  console.log("Success: bible_with_embeddings.json created.");
}

processBible();
