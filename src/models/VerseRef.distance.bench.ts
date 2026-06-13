import { beforeAll, bench, describe } from "vitest";
import { VerseRef, type bibleData } from "./VerseRef";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadKJV = (): bibleData => {
  const filePath = resolve(process.cwd(), "data/translations/KJV.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as bibleData;
};

describe("VerseRef.distance benchmark", () => {
  const sampleSize = 5_000;
  const inputs = Array.from({ length: sampleSize }, (_, i) => i / (sampleSize - 1));
  let idx = 0;

  beforeAll(() => {
    VerseRef.bibleTranslations.KJV = loadKJV();
    VerseRef.defaultTranslation = "KJV";

    // Prime caches so this benchmark captures steady-state lookup performance.
    VerseRef.distance(0.5);
  });

  bench("distance steady-state lookup", () => {
    const distance = inputs[idx];
    idx = (idx + 1) % inputs.length;
    VerseRef.distance(distance);
  });

  bench("distance edge values", () => {
    VerseRef.distance(-1);
    VerseRef.distance(0);
    VerseRef.distance(1);
    VerseRef.distance(2);
  });
});
