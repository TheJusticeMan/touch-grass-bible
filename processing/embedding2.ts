import { writeFileSync } from "fs";
import ollama from "ollama";
import pLimit from "p-limit";
import KJV from "../data/translations/KJV.json";

const limit = pLimit(50);

const bible = KJV as { [book: string]: [null, ...string[]][] };

const startTime = performance.now();
const numberOfChapters = Object.keys(bible)
  .map(book => bible[book].slice(1).map(chapter => chapter.length - 1))
  .flat()
  .reduce((sum, chapters) => sum + chapters, 0);
let done = 0;
const verses = await getEmbeddings(
  Object.keys(bible)
    .map(book =>
      bible[book]
        .slice(1)
        .map((chapter, index) =>
          chapter.slice(1).map((verse, verseIndex) => ({
            book,
            chapter: index + 1,
            verse: verseIndex + 1,
            bestmatch: { book, chapter: index + 1, verse: verseIndex + 1, distance: 1, id: 0 },
            text: verse as string,
            groupid: 0,
            id: verseIndex + 1, // Add an ID for each verse
          }))
        )
        .flat()
    )
    .flat()
);
const model = "nomic-embed-text";
let book = "";
function getEmbeddings(
  chapters: {
    book: string;
    chapter: number;
    verse: number;
    bestmatch: {
      book: string;
      chapter: number;
      verse: number;
      distance: number;
      id: number;
    };
    text: string;
    groupid: number;
  }[]
) {
  let e = 0;
  return Promise.all(
    chapters.map(chapter =>
      limit(() =>
        // @ts-ignore
        ollama
          .embeddings({
            model: "snowflake-arctic-embed:22m",
            prompt: chapter.text,
          })
          .then(
            em => (
              done++ % 64 === 0 &&
                console.log(
                  `Embedding for ${chapter.book} ${chapter.chapter} completed.`,
                  done,
                  " Progress: ",
                  ((done / numberOfChapters) * 100).toFixed(2) + "%",
                  " Time left: ",
                  getTimeLeft(((numberOfChapters - done) * (performance.now() - startTime)) / done)
                ),
              { ...chapter, embedding: em.embedding }
            )
          )
      )
    )
  );
}

function getTimeLeft(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

const endTime = performance.now();
console.log(`Embedding process completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds.`);

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vectors must be of the same length");
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  const normA = l2Norm(a);
  const normB = l2Norm(b);
  if (normA === 0 || normB === 0) throw new Error("Zero-vector detected");
  return dot / (normA * normB);
}

function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

let count = 0;

for (let i = 0; i < verses.length; i++) {
  for (let j = i + 1; j < verses.length; j++) {
    const dist = cosineDistance(verses[i].embedding, verses[j].embedding);
    if (verses[i].bestmatch.distance > dist)
      verses[i].bestmatch = {
        book: verses[j].book,
        chapter: verses[j].chapter,
        verse: verses[j].verse,
        distance: dist,
        id: j,
      };
    if (verses[j].bestmatch.distance > dist)
      verses[j].bestmatch = {
        book: verses[i].book,
        chapter: verses[i].chapter,
        verse: verses[i].verse,
        distance: dist,
        id: i,
      };
  }
  count++ % 256 === 0 &&
    console.log(
      `Chapters ${i + 1} and`,
      verses[i].bestmatch,
      ` are similar with distance: ${verses[i].bestmatch.distance}`
    );
}

let groupId = 1;

verses.forEach(chapter => {
  const bestc = verses[chapter.bestmatch.id];
  if (!chapter.groupid) {
    if (bestc.groupid) {
      chapter.groupid = bestc.groupid;
      return;
    } else {
      chapter.groupid = groupId++;
      bestc.groupid = chapter.groupid;
    }
  } else {
    if (bestc.groupid) {
      if (chapter.groupid !== bestc.groupid) {
        verses.forEach(c => {
          if (c.groupid === bestc.groupid) c.groupid = chapter.groupid;
        });
      }
      return;
    } else {
      bestc.groupid = chapter.groupid;
    }
  }
});

const groupids = verses.reduce((acc, chapter) => {
  if (!acc.includes(chapter.groupid)) acc.push(chapter.groupid);
  return acc;
}, [] as number[]);
console.log("Unique group IDs:", groupids.length, groupids);

writeFileSync("processing/chapters.json", JSON.stringify(verses, null, 2), "utf-8");
