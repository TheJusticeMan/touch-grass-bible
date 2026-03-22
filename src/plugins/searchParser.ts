import type { bibleData } from "../models/VerseRef";

export type BibleMatch = {
  book: string;
  chapter?: number;
  verse?: number;
};

const normalizeQuerySegment = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/^[\s:.,;-]+/, "");

export function parseGoToVerseQuery(
  query: string,
  booksOfTheBible: string[],
  bible: bibleData,
): BibleMatch[] {
  const eat = (q: string, list: string[]) => {
    const normalizedQ = normalizeQuerySegment(q);
    if (!normalizedQ) return [];

    // Pre-calculate matches to find the global maxMatchLen for this query
    const matches = list.map(item => {
      const lowerItem = item.toLowerCase();
      let matchLen = 0;
      while (
        matchLen < normalizedQ.length &&
        matchLen < lowerItem.length &&
        normalizedQ[matchLen] === lowerItem[matchLen]
      ) {
        matchLen++;
      }
      return { item, matchLen };
    });

    const maxMatchLen = Math.max(0, ...matches.map(m => m.matchLen));

    // Only return if we actually matched something substantial
    if (maxMatchLen === 0) return [];

    return matches
      .filter(m => m.matchLen === maxMatchLen)
      .map(m => ({ item: m.item, remaining: normalizeQuerySegment(normalizedQ.slice(m.matchLen)) }))
      .filter(m => m.remaining.length === 0 || !/^[a-z]/.test(m.remaining));
  };

  const bestBookMatches = eat(query, booksOfTheBible);

  // We only proceed with specific number parsing if we have a clear book match
  if (bestBookMatches.length === 1) {
    const { item: book, remaining } = bestBookMatches[0];

    const chapterList = Array.from({ length: bible[book].length - 1 }, (_, i) => (i + 1).toString());
    const chapterMatches = eat(remaining, chapterList);

    let chapter: number | undefined;

    if (chapterMatches.length === 1) {
      const { item: chItem, remaining: verseRemaining } = chapterMatches[0];
      chapter = parseInt(chItem, 10);

      const verseList = Array.from({ length: bible[book][chapter].length - 1 }, (_, i) => (i + 1).toString());
      const verseMatches = eat(verseRemaining, verseList);

      if (!verseMatches.length) return verseList.map(v => ({ book, chapter, verse: parseInt(v, 10) }));

      return verseMatches.map(({ item }) => ({ book, chapter, verse: parseInt(item, 10) }));
    }

    if (!chapterMatches.length) return chapterList.map(ch => ({ book, chapter: parseInt(ch, 10) }));

    return chapterMatches.map(({ item }) => ({ book, chapter: parseInt(item, 10) }));
  }

  return bestBookMatches.map(m => ({ book: m.item }));
}
