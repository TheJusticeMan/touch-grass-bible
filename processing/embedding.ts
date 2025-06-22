import { writeFileSync } from "fs";
import ollama from "ollama";
import pLimit from "p-limit";
import KJV from "../data/translations/KJV.json";

const limit = pLimit(5);

const bible = KJV as { [book: string]: [null, ...string[]][] };

const startTime = performance.now();
const numberOfChapters = Object.keys(bible)
  .map(book => bible[book].length - 1) // Exclude the first element which is the book name
  .reduce((sum, chapters) => sum + chapters, 0);
let done = 0;
const chapters = await getEmbeddings(
  Object.keys(bible)
    .map(book =>
      bible[book].slice(1).map((chapter, index) => ({
        book,
        chapter: index + 1,
        bestmatch: { book, chapter: index + 1, distance: 1, id: 0 },
        text: chapter
          .slice(1)
          //.map((v, i) => `${i + 1}: ${v}`)
          .join("\n"),
        groupid: 0,
      }))
    )
    .flat()
);
const model = "nomic-embed-text";
let book = "";
function getEmbeddings(
  chapters: {
    book: string;
    chapter: number;
    bestmatch: {
      book: string;
      chapter: number;
      distance: number;
      id: number;
    };
    text: string;
    groupid: number;
  }[]
) {
  return Promise.all(
    chapters.map(chapter =>
      limit(() =>
        // @ts-ignore
        ollama
          .embeddings({
            model: "nomic-embed-text",
            prompt: chapter.text,
          })
          .then(
            em => (
              console.log(
                `Embedding for ${chapter.book} ${chapter.chapter} completed.`,
                done++,
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

for (let i = 0; i < chapters.length; i++) {
  for (let j = i + 1; j < chapters.length; j++) {
    const dist = cosineDistance(chapters[i].embedding, chapters[j].embedding);
    if (chapters[i].bestmatch.distance > dist)
      chapters[i].bestmatch = { book: chapters[j].book, chapter: chapters[j].chapter, distance: dist, id: j };
    if (chapters[j].bestmatch.distance > dist)
      chapters[j].bestmatch = { book: chapters[i].book, chapter: chapters[i].chapter, distance: dist, id: i };
  }
  console.log(
    `Chapters ${i + 1} and`,
    chapters[i].bestmatch,
    ` are similar with distance: ${chapters[i].bestmatch.distance}`
  );
}

let groupId = 1;

chapters.forEach(chapter => {
  const bestc = chapters[chapter.bestmatch.id];
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
        chapters.forEach(c => {
          if (c.groupid === bestc.groupid) c.groupid = chapter.groupid;
        });
      }
      return;
    } else {
      bestc.groupid = chapter.groupid;
    }
  }
});

const groupids = chapters.reduce((acc, chapter) => {
  if (!acc.includes(chapter.groupid)) acc.push(chapter.groupid);
  return acc;
}, [] as number[]);
console.log("Unique group IDs:", groupids.length, groupids);

writeFileSync("processing/chapters.json", JSON.stringify(chapters, null, 2), "utf-8");
