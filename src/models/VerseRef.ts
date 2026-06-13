import { books3letter, BookShortNames, booksOfTheBible } from "./booksOfTheBible";
import type { DataBibleChapter, DataBibleTranslationFile } from "./DataTypes";

export type bibleData = DataBibleTranslationFile;

export type OSIS = string;
export type translation = "KJV" | "YLT" | "ASV";
/**
 * Represents a reference to a specific verse in the Bible, including book, chapter, and verse.
 * Provides utilities for converting between different reference formats (e.g., OSIS),
 * retrieving verse text and related data, and accessing cross-references and topics.
 *
 * Static properties:
 * - `booksOfTheBible`: List of full book names in canonical order.
 * - `BookShortNames`: List of short book codes/names corresponding to each book.
 * - `bible`: Nested object containing Bible text data for each translation.
 * - `crossRefs`: Mapping of OSIS references to arrays of cross-references.
 * - `topics`: Mapping of topic names to arrays of verse references.
 *
 * Instance properties:
 * - `book`: The full name of the book.
 * - `chapter`: The chapter number.
 * - `verse`: The verse number.
 *
 * Methods:
 * - `text(translation)`: Returns the text of the verse for the given translation.
 * - `crossRefs()`: Returns an array of `VerseRef` objects that are cross-references for this verse.
 * - `toOSIS()`: Converts the reference to OSIS format (e.g., "Gen.1.1").
 * - `toString()`: Returns a human-readable string representation (e.g., "Genesis 1:1").
 * - `verseData(translation)`: Returns the verse text for the given translation.
 * - `chapterData(translation)`: Returns all verses in the chapter for the given translation.
 * - `bookData(translation)`: Returns all chapters and verses in the book for the given translation.
 * - `vTXT`: Shortcut for `verseData` using the default translation.
 * - `cTXT`: Shortcut for `chapterData` using the default translation.
 * - `bTXT`: Shortcut for `bookData` using the default translation.
 *
 * Static methods:
 * - `fromOSIS(osis)`: Creates a `VerseRef` from an OSIS string.
 */
export class VerseRef {
  static booksOfTheBible: string[] = booksOfTheBible;
  static BookShortNames: OSIS[] = BookShortNames;
  static books3letter: string[] = books3letter;
  static bibleTranslations: { [translation: string]: bibleData } = {};

  static defaultTranslation: translation = "KJV";
  static get bible() {
    return this.bibleTranslations[this.defaultTranslation];
  }
  static get RandomVerse(): VerseRef {
    const book = VerseRef.booksOfTheBible[(Math.random() * (VerseRef.booksOfTheBible.length - 1)) | 0];
    if (!VerseRef.bibleTranslations.KJV) return new VerseRef(book, 1, 1);
    const bookData = VerseRef.bibleTranslations.KJV[book];
    const chapter = Math.floor(Math.random() * (bookData.length - 2)) + 1;
    const chapterData = VerseRef.getChapterValues(bookData, chapter);
    const verse = Math.floor(Math.random() * (chapterData.length - 2)) + 1;
    return new VerseRef(book, chapter, verse);
  }

  private static getChapterValues(bookData: bibleData[string], chapter: number): DataBibleChapter {
    const chapterData = bookData?.[chapter];
    if (!Array.isArray(chapterData)) return [];
    return chapterData;
  }

  constructor(
    public book: string = "GENESIS",
    public chapter: number = 1,
    public verse: number = 1,
  ) {}
  isSameChapter(value: VerseRef) {
    return this.book === value.book && this.chapter === value.chapter;
  }
  setVerse(v: number): VerseRef {
    this.verse = v;
    return this;
  }
  isSame(verse: VerseRef) {
    return this.book === verse.book && this.chapter === verse.chapter && this.verse === verse.verse;
  }

  isSameChap(verse: VerseRef) {
    return this.book === verse.book && this.chapter === verse.chapter;
  }

  text(translation: translation): string {
    const bookData = VerseRef.bibleTranslations[translation]?.[this.book];
    const chapterData = bookData ? VerseRef.getChapterValues(bookData, this.chapter) : [];
    const verseText = chapterData[this.verse];
    return typeof verseText === "string" ? verseText : "";
  }

  toOSIS(): string {
    const bookIndex = VerseRef.booksOfTheBible.indexOf(this.book);
    const bookCode = VerseRef.BookShortNames[bookIndex] || this.book;
    return `${bookCode}.${this.chapter}.${this.verse}`;
  }
  static fromOSIS(osis: string): VerseRef {
    const parts = osis.split("-")[0].split(".");
    const [bookCode, chapter, verse] = parts;
    const bookIndex = VerseRef.BookShortNames.indexOf(bookCode);
    if (bookIndex === -1) {
      // console.warn is intentional here: fromOSIS is a static method with no app instance
      console.warn(`Unknown OSIS book code: ${bookCode}`);
      return new VerseRef("GENESIS", 1, 1);
    }
    const chapterNum = parseInt(chapter ?? "1", 10);
    const verseNum = parseInt(verse ?? "1", 10);
    return new VerseRef(
      VerseRef.booksOfTheBible[bookIndex],
      isNaN(chapterNum) ? 1 : chapterNum,
      isNaN(verseNum) ? 1 : verseNum,
    );
  }

  private static _verseCount?: number;

  static get verseCount(): number {
    return (
      this._verseCount ||
      (this._verseCount = VerseRef.booksOfTheBible.reduce((sum, book) => {
        const chapters = VerseRef.bible?.[book] || [];
        const verseCount = chapters.reduce(
          (sum, chapter) => sum + (Array.isArray(chapter) ? chapter.length - 1 : 0),
          0,
        );
        return sum + verseCount;
      }, 0))
    );
  }

  private static _versesBeforeIndex?: { [book: string]: number[] };

  private static _distanceIndexByTranslation: {
    [key in translation]?: {
      chapterStarts: { book: string; chapter: number; startVerse: number; verseCount: number }[];
      totalVerses: number;
    };
  } = {};

  static get versesBeforeIndex(): { [book: string]: number[] } {
    if (this._versesBeforeIndex) return this._versesBeforeIndex;
    const versesBeforeIndex: { [book: string]: number[] } = {};
    let cumulativeVerses = 0;
    for (const book of VerseRef.booksOfTheBible) {
      const chapters = VerseRef.bible?.[book] || [];
      const chapterVerses: number[] = [];
      for (let chapterNum = 1; chapterNum < chapters.length; chapterNum++) {
        const chapter = chapters[chapterNum];
        if (!Array.isArray(chapter)) continue;
        chapterVerses.push(cumulativeVerses);
        cumulativeVerses += chapter.length - 1;
      }
      versesBeforeIndex[book] = chapterVerses;
    }
    return (this._versesBeforeIndex = versesBeforeIndex);
  }

  private static getDistanceIndex(t: translation): {
    chapterStarts: { book: string; chapter: number; startVerse: number; verseCount: number }[];
    totalVerses: number;
  } {
    const existing = this._distanceIndexByTranslation[t];
    if (existing) return existing;

    const bible = this.bibleTranslations[t];
    if (!bible) {
      return {
        chapterStarts: [],
        totalVerses: 0,
      };
    }

    const chapterStarts: { book: string; chapter: number; startVerse: number; verseCount: number }[] = [];
    let totalVerses = 0;

    for (const book of VerseRef.booksOfTheBible) {
      const chapters = bible[book] || [];
      for (let chapterNum = 1; chapterNum < chapters.length; chapterNum++) {
        const chapter = chapters[chapterNum];
        if (!Array.isArray(chapter)) continue;

        const verseCount = Math.max(chapter.length - 1, 0);
        if (verseCount <= 0) continue;

        chapterStarts.push({
          book,
          chapter: chapterNum,
          startVerse: totalVerses,
          verseCount,
        });
        totalVerses += verseCount;
      }
    }

    const index = { chapterStarts, totalVerses };
    this._distanceIndexByTranslation[t] = index;
    return index;
  }

  /**
   * Returns a `VerseRef` corresponding to a position in the Bible represented by a number between 0 and 1.
   *
   * @param num a number between 0 and 1 for how far throgh the bible
   */
  static distance(num: number): VerseRef {
    const { chapterStarts, totalVerses } = this.getDistanceIndex(this.defaultTranslation);
    const clamped = Math.min(Math.max(num, 0), 1);
    if (totalVerses <= 0 || chapterStarts.length === 0) return new VerseRef("GENESIS", 1, 1);

    const targetVerse = Math.min(Math.floor(clamped * totalVerses), totalVerses - 1);

    // Find the chapter range containing targetVerse using binary search.
    let left = 0;
    let right = chapterStarts.length - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const chapter = chapterStarts[mid];
      const chapterEnd = chapter.startVerse + chapter.verseCount;

      if (targetVerse < chapter.startVerse) {
        right = mid - 1;
      } else if (targetVerse >= chapterEnd) {
        left = mid + 1;
      } else {
        return new VerseRef(chapter.book, chapter.chapter, targetVerse - chapter.startVerse + 1);
      }
    }

    return new VerseRef("GENESIS", 1, 1);
  }

  getDistance(): number {
    const versesBeforeBook = VerseRef.versesBeforeIndex[this.book]?.[this.chapter - 1] ?? 0;
    const verseIndex = versesBeforeBook + this.verse - 1;
    return verseIndex / VerseRef.verseCount;
  }

  toString(): string {
    return `${this.book.toTitleCase()} ${this.chapter}:${this.verse}`;
  }
  toChapterString(): string {
    return `${this.book.toTitleCase()} ${this.chapter}`;
  }
  verseData(translation: translation): string {
    const bookData = VerseRef.bibleTranslations[translation]?.[this.book];
    const chapterData = bookData ? VerseRef.getChapterValues(bookData, this.chapter) : [];
    const verseText = chapterData[this.verse];
    return typeof verseText === "string" ? verseText : "";
  }
  chapterData(translation: translation): string[] {
    const bookData = VerseRef.bibleTranslations[translation]?.[this.book];
    const chapterData = bookData ? VerseRef.getChapterValues(bookData, this.chapter) : [];
    return chapterData as string[];
  }
  bookData(translation: translation): string[][] {
    return (VerseRef.bibleTranslations[translation]?.[this.book] as unknown as string[][]) || [];
  }
  get vTXT(): string {
    const bookData = VerseRef.bible?.[this.book];
    const chapterData = bookData ? VerseRef.getChapterValues(bookData, this.chapter) : [];
    const verseText = chapterData[this.verse];
    return typeof verseText === "string" ? verseText : "";
  }
  get cTXT(): string[] {
    const bookData = VerseRef.bible?.[this.book];
    const chapterData = bookData ? VerseRef.getChapterValues(bookData, this.chapter) : [];
    return chapterData as string[];
  }
  get bTXT(): string[][] {
    return (VerseRef.bible?.[this.book] as unknown as string[][]) || [];
  }
  set OSIS(osis: string) {
    const [[book, chapter, verse]] = osis.split("-").map(ft => ft.split("."));
    const newVerse = new VerseRef(
      VerseRef.booksOfTheBible[VerseRef.BookShortNames.indexOf(book)] || "GENESIS",
      parseInt(chapter ?? 1, 10),
      parseInt(verse ?? 1, 10),
    );
    this.book = newVerse.book;
    this.chapter = newVerse.chapter;
    this.verse = newVerse.verse;
  }
  get OSIS(): string {
    return this.toOSIS();
  }
  get letter3(): string {
    return VerseRef.books3letter[VerseRef.booksOfTheBible.indexOf(this.book)] || this.book;
  }
  get YouVersionURL(): string {
    return `https://www.bible.com/bible/1/${this.letter3}.${this.chapter}.${this.verse}`;
  }
  get blbURL(): string {
    return `https://www.blueletterbible.org/kjv/${this.letter3}/${this.chapter}/${this.verse}`;
  }
  get gatewayURL(): string {
    const book = this.book === "SONG SOLOMON" ? "SONG OF SOLOMON" : this.book;
    return `https://www.biblegateway.com/passage/?search=${book}+${this.chapter}%3A${this.verse}&version=${VerseRef.defaultTranslation}`;
  }
  nextChapterIn(t: translation): VerseRef {
    const bible = VerseRef.bibleTranslations[t];
    const { book, chapter } = this;
    const nextChapter = chapter + 1;
    const nextBookIndex = VerseRef.booksOfTheBible.indexOf(book) + 1;
    const bookData = bible[book];
    if (nextChapter > bookData.length - 1) {
      if (nextBookIndex > VerseRef.booksOfTheBible.length) {
        return new VerseRef(VerseRef.booksOfTheBible[0], 1, 1);
      }
      return new VerseRef(VerseRef.booksOfTheBible[nextBookIndex], 1, 1);
    }
    return new VerseRef(book, nextChapter, 1);
  }
  get nextChapter(): VerseRef {
    return this.nextChapterIn(VerseRef.defaultTranslation);
  }

  Chapteroffset(offset: number): VerseRef {
    let { book, chapter } = this;
    chapter += offset;
    while (chapter < 1) {
      const prevBookIndex = VerseRef.booksOfTheBible.indexOf(book) - 1;
      if (prevBookIndex < 0) {
        book = VerseRef.booksOfTheBible[VerseRef.booksOfTheBible.length - 1];
      } else {
        book = VerseRef.booksOfTheBible[prevBookIndex];
      }
      chapter += VerseRef.bible[book].length - 1;
    }
    while (chapter > VerseRef.bible[book].length - 1) {
      chapter -= VerseRef.bible[book].length - 1;
      const nextBookIndex = VerseRef.booksOfTheBible.indexOf(book) + 1;
      if (nextBookIndex >= VerseRef.booksOfTheBible.length) {
        book = VerseRef.booksOfTheBible[0];
      } else {
        book = VerseRef.booksOfTheBible[nextBookIndex];
      }
    }
    return new VerseRef(book, chapter, 1);
  }

  /**
   * Returns a new {@link VerseRef} instance representing the last verse of the previous chapter.
   *
   * - If the current chapter is the first chapter of the book, it navigates to the last chapter of the previous book.
   * - If the current book is the first book, it wraps around to the last book.
   * - The returned reference always points to the last verse of the resolved previous chapter.
   *
   * @returns {VerseRef} A new VerseRef pointing to the last verse of the previous chapter.
   */
  prevChapterIn(t: translation): VerseRef {
    const bible = VerseRef.bibleTranslations[t];
    const { book, chapter } = this;
    const books = VerseRef.booksOfTheBible;

    const currentBookIndex = books.indexOf(book);
    let prevBookIndex = currentBookIndex - 1;

    let prevBook: string;
    let prevChapter: number;

    if (chapter > 1) {
      // Previous chapter in the same book
      prevBook = book;
      prevChapter = chapter - 1;
    } else {
      // Need to go to previous book's last chapter
      if (prevBookIndex < 0) {
        // Wrap around to the last book
        prevBookIndex = books.length - 1;
      }
      prevBook = books[prevBookIndex];
      prevChapter = bible[prevBook].length - 1; // last chapter index
    }

    const prevChapterData = VerseRef.getChapterValues(bible[prevBook], prevChapter);
    const lastVerseIndex = prevChapterData.length - 1;
    return new VerseRef(prevBook, prevChapter, lastVerseIndex);
  }
  get prevChapter(): VerseRef {
    return this.prevChapterIn(VerseRef.defaultTranslation);
  }
}
