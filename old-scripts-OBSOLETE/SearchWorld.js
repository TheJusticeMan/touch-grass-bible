import { create, insert, search } from "@orama/orama";

const OLLAMA_URL = "http://localhost:11434/api/embeddings";
const MODEL = "nomic-embed-text";

async function embedVerse(text) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });
  if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
  const data = await response.json();
  return data.embedding;
}

// 1. Create the schema
const db = await create({
  schema: {
    text: "string",
    metadata: { book: "string", chapter: "number", verse: "number" },
    embedding: "vector[768]", // Match your Ollama model dimensions
  },
});

// 2. Load and Insert your data
// (Assume 'bible_with_embeddings' is the JSON from your previous script)
import fs from "fs";

// Load bible data from a JSON file
const bibleData = JSON.parse(fs.readFileSync("./scripts/bible_with_embeddings.json", "utf-8"));

// Insert each verse into Orama
console.log("Inserting verses into Orama...");
for (let book in bibleData) {
  if (!bibleData[book]) continue;
  for (let chapter in bibleData[book]) {
    if (!bibleData[book][chapter]) continue;
    for (let verse in bibleData[book][chapter]) {
      if (!bibleData[book][chapter][verse]) continue;
      try {
        await insert(db, {
          text: bibleData[book][chapter][verse].text,
          metadata: {
            book,
            chapter: parseInt(chapter),
            verse: parseInt(verse),
          },
          embedding: bibleData[book][chapter][verse].embedding,
        });
      } catch (error) {
        console.error(`Error inserting verse ${book} ${chapter}:${verse}`, error);
      }
    }
  }
}
console.log("Insertion complete!");

console.time("Search Time");
const query = "For God so loved the world";
const queryVector = {
  value: await embedVerse(query),
  property: "embedding",
}; // Get embedding for the search query

// 3. Search (The <10ms part)
const results = await search(db, {
  mode: "vector",
  vector: queryVector, // Vector from Ollama for your search term
  similarity: 0.2, // Minimum similarity score
});

console.log(results.hits.length, "results found:");
console.timeEnd("Search Time");
