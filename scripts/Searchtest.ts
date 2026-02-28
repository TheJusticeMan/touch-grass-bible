import fs from "fs";
import path from "path";

/**
 * Loads Bible verses with embeddings from a JSON file.
 * @param filePath Path to the JSON file.
 * @returns Array of verse objects with embeddings.
 */
function loadBibleWithEmbeddings(
  filePath: string,
): Record<string, Record<string, Record<string, { text: string; embedding: number[] }>>> {
  const data = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(data);
}

/**
 * Computes cosine similarity between two vectors.
 * @param a First vector.
 * @param b Second vector.
 * @returns Cosine similarity value.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (normA * normB);
}

/**
 * Finds the most similar verses to the query embedding.
 * @param verses Array of verse objects with embeddings.
 * @param queryEmbedding Embedding vector for the query.
 * @param topK Number of top results to return.
 * @returns Array of topK most similar verses.
 */
type VerseInfo = {
  book: string;
  chapter: string;
  verse: string;
  text: string;
  embedding: number[];
  similarity: number;
};

function searchEmbeddings(
  verses: Record<string, Record<string, Record<string, { text: string; embedding: number[] }>>>,
  queryEmbedding: number[],
  topK = 5,
): VerseInfo[] {
  const verseList: VerseInfo[] = [];
  for (const book in verses) {
    for (const chapter in verses[book]) {
      for (const verseNum in verses[book][chapter]) {
        const verseObj = verses[book][chapter][verseNum];
        verseList.push({
          book,
          chapter,
          verse: verseNum,
          text: verseObj.text,
          embedding: verseObj.embedding,
          similarity: cosineSimilarity(verseObj.embedding, queryEmbedding),
        });
      }
    }
  }
  return verseList.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// Removed unused flatten function

// Example usage:
const filePath = path.resolve(process.cwd(), "./scripts/bible_with_embeddings.json");
const verses = loadBibleWithEmbeddings(filePath);

// Example query embedding (replace with actual embedding)
const firstBook = Object.keys(verses)[0];
const firstChapter = Object.keys(verses[firstBook])[0];
const firstVerse = Object.keys(verses[firstBook][firstChapter])[0];
const queryEmbedding = Array(verses[firstBook][firstChapter][firstVerse].embedding.length).fill(0.01);

const results = searchEmbeddings(verses, queryEmbedding, 5);
console.log("Top results:");
results.forEach(verse => {
  console.log(
    `${verse.book} ${verse.chapter}:${verse.verse} - ${verse.text} (similarity: ${verse.similarity.toFixed(4)})`,
  );
});
