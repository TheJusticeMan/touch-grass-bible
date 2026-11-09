/* eslint-disable security/detect-non-literal-fs-filename */
import { readFile } from "node:fs/promises";

type Verse = {
  book: string;
  chapter: string;
  verse: string;
  text: string;
};

type BibleData = Record<string, Record<string, Record<string, string>>>;

type VerseRelationResponse = {
  answers?: {
    related?: {
      noul?: boolean;
    };
  };
};

const BIBLE_FILE_PATH = "data/translations/KJV.json";
const AI_ENDPOINT = "http://localhost:11434/v1/systemone";
const MODEL_NAME = "d3:2b";
const SAMPLE_SIZE = 20;
const CONCURRENCY = Number.parseInt(process.env.AI_CONCURR + ENCY ?? "8", 10) || 8;
const REQUEST_TIMEOUT_MS = 30_000;
const PROGRESS_LOG_INTERVAL = 5;

console.log(`Decision script loaded: sample=${SAMPLE_SIZE}, concurrency=${CONCURRENCY}`);

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

function shuffle<T>(items: T[]): T[] {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function takeRandomSample<T>(items: T[], sampleSize: number): T[] {
  return shuffle(items).slice(0, Math.min(sampleSize, items.length));
}

function flattenVerses(bible: BibleData): Verse[] {
  return Object.entries(bible).flatMap(([book, chapters]) =>
    Object.entries(chapters).flatMap(([chapter, verses]) =>
      Object.entries(verses ?? {}).map(([verseNumber, text]) => ({
        book,
        chapter,
        verse: verseNumber,
        text,
      })),
    ),
  );
}

function formatVerse(verse: Verse): string {
  return `${verse.book} ${verse.chapter}:${verse.verse} - ${verse.text}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}

function makeAiRequestBody(verse1: Verse, verse2: Verse): string {
  return JSON.stringify({
    model: MODEL_NAME,
    state: `Verse 1: ${verse1.text}\nVerse 2: ${verse2.text}`,
    questions: {
      related: {
        type: "noul",
        instructions: "Do these verses share meaningful conceptual, lexical, or theological linkage?",
        criteria: {
          true: "The verses are related.",
          false: "The verses have no discernible textual or thematic bridge.",
        },
      },
    },
  });
}

async function isVersesRelated(verse1: Verse, verse2: Verse): Promise<boolean> {
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: makeAiRequestBody(verse1, verse2),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}`);
  }

  const data = (await response.json()) as VerseRelationResponse;
  return Boolean(data.answers?.related?.noul);
}

function buildPairs(verses: Verse[]): Array<{ verse1: Verse; verse2: Verse }> {
  const pairs: Array<{ verse1: Verse; verse2: Verse }> = [];

  for (let index = 0; index < verses.length; index++) {
    for (let comparisonIndex = index + 1; comparisonIndex < verses.length; comparisonIndex++) {
      pairs.push({
        verse1: verses[index],
        verse2: verses[comparisonIndex],
      });
    }
  }

  return pairs;
}

async function evaluateVersePairs(): Promise<void> {
  const bible = await readJson<BibleData>(BIBLE_FILE_PATH);
  const verses = takeRandomSample(flattenVerses(bible), SAMPLE_SIZE);

  if (verses.length < 2) {
    console.log("Not enough verses to compare.");
    return;
  }

  const pairs = buildPairs(verses);
  const totalPairs = pairs.length;
  const startedAt = Date.now();
  let completedPairs = 0;
  let lastProgressLog = 0;

  const processNextBatch = async (batch: Array<{ verse1: Verse; verse2: Verse }>) => {
    const results = await Promise.all(
      batch.map(async ({ verse1, verse2 }) => {
        const pairLabel = `${formatVerse(verse1)} AND ${formatVerse(verse2)}`;

        try {
          const related = await isVersesRelated(verse1, verse2);
          completedPairs += 1;

          if (completedPairs - lastProgressLog >= PROGRESS_LOG_INTERVAL || completedPairs === totalPairs) {
            const elapsedMs = Date.now() - startedAt;
            const percentComplete = ((completedPairs / totalPairs) * 100).toFixed(1);
            const pairsPerSecond = completedPairs / Math.max(elapsedMs / 1000, 0.001);
            const remainingPairs = totalPairs - completedPairs;
            const etaMs = remainingPairs > 0 ? (remainingPairs / pairsPerSecond) * 1000 : 0;

            console.log(
              `[${percentComplete}%] ${completedPairs}/${totalPairs} pairs complete | ` +
                `${pairsPerSecond.toFixed(2)} pairs/s | elapsed ${formatDuration(elapsedMs)} | ` +
                `ETA ${formatDuration(etaMs)} | ${pairLabel} => ${related}`,
            );
            lastProgressLog = completedPairs;
          }

          return { pairLabel, related };
        } catch (error) {
          completedPairs += 1;
          console.error(`Failed to evaluate pair: ${pairLabel}`, error);
          return { pairLabel, related: false };
        }
      }),
    );

    return results;
  };

  const allResults: Array<{ pairLabel: string; related: boolean }> = [];

  for (let index = 0; index < pairs.length; index += CONCURRENCY) {
    const batch = pairs.slice(index, index + CONCURRENCY);
    const batchResults = await processNextBatch(batch);
    allResults.push(...batchResults);
  }

  const elapsedMs = Date.now() - startedAt;
  const pairsPerSecond = allResults.length / Math.max(elapsedMs / 1000, 0.001);

  console.log(
    `Finished ${allResults.length} verse comparisons in ${formatDuration(elapsedMs)} ` +
      `(${pairsPerSecond.toFixed(2)} pairs/s).`,
  );
}

await evaluateVersePairs();
