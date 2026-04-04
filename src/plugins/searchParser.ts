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
      .map(m => {
        const remainingRaw = normalizedQ.slice(m.matchLen);
        return {
          item: m.item,
          remainingRaw,
          remaining: normalizeQuerySegment(remainingRaw),
        };
      })
      .filter(m => m.remaining.length === 0 || !/^[a-z]/.test(m.remaining));
  };

  const bestBookMatches = eat(query, booksOfTheBible);

  // We only proceed with specific number parsing if we have a clear book match
  if (bestBookMatches.length === 1) {
    const { item: book, remaining, remainingRaw } = bestBookMatches[0];

    // If numeric input continues after the chapter digits, switch to strict numeric parsing.
    const strictChapterMatch = remainingRaw.match(/^(\d+)(.*)$/);
    if (strictChapterMatch && strictChapterMatch[2].trim().length > 0) {
      const chapter = parseInt(strictChapterMatch[1], 10);
      if (chapter < 1 || chapter >= bible[book].length) return [];

      const verseSegment = normalizeQuerySegment(strictChapterMatch[2]);
      if (!verseSegment.length) return [{ book, chapter }];

      const strictVerseMatch = verseSegment.match(/^(\d+)(.*)$/);
      if (!strictVerseMatch) return [];

      const verse = parseInt(strictVerseMatch[1], 10);
      if (verse < 1 || verse >= bible[book][chapter].length) return [];

      // Any trailing non-delimiter content after verse makes this query invalid.
      if (normalizeQuerySegment(strictVerseMatch[2]).length > 0) return [];

      return [{ book, chapter, verse }];
    }

    const chapterList = Array.from({ length: bible[book].length - 1 }, (_, i) => (i + 1).toString());
    const chapterMatches = eat(remaining, chapterList);

    let chapter: number | undefined;

    if (chapterMatches.length === 1) {
      const { item: chItem, remaining: verseRemaining, remainingRaw: verseRemainingRaw } = chapterMatches[0];
      chapter = parseInt(chItem, 10);

      // If there are only trailing delimiters after the chapter, keep chapter-only result.
      if (verseRemainingRaw.trim().length > 0 && verseRemaining.length === 0) {
        return [{ book, chapter }];
      }

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
