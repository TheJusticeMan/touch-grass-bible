import Bibledata from "./bible_with_embeddings.json";

export const flattened = Object.entries(
  Bibledata as Record<string, { text: string; embedding: number[] }[][][]>,
).map(([key, book]) =>
  book
    .map((chapter, chapterIndex) =>
      chapter.map((verse, verseIndex) =>
        verse.map(embedding => ({
          book: key,
          chapter: chapterIndex,
          verse: verseIndex,
          ...embedding,
        })),
      ),
    )
    .flat(2),
);
