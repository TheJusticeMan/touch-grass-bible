import { BibleTopics, BibleTopicsType } from "./BibleTopics";
import { BookShortNames, booksOfTheBible } from "./booksOfTheBible";
import { Highlighter } from "./external/App";
export type bibleData = { [book: string]: string[][] };

export const VerseHighlight: Highlighter = new Highlighter([
  { regEXP: /\[(.+?)\]/gi, elTag: "i" },
  { regEXP: /(LORD|God)/gi, elTag: "b" },
  { regEXP: /^(\d+)/gi, cls: "verseNumber" },
  { regEXP: /#/gi, cls: "versePBreak", replace: "\u00B6" },
]);

export const VerseSHighlight: Highlighter = new Highlighter([
  { regEXP: /\[(.+?)\]/gi, elTag: "i" },
  { regEXP: /(LORD|God)/gi, elTag: "b" },
  { regEXP: /^([^:]+:\d+)/gi, cls: "verseNumber" },
  { regEXP: /#/gi, cls: "versePBreak", replace: "\u00B6" },
]);

export type translation = "KJV" | "YLT" | "ASV";
export const translationMetadata: { [key in translation]: { name: string; shortName: string } } = {
  KJV: { name: "King James Version", shortName: "KJV" },
  YLT: { name: "Young's Literal Translation", shortName: "YLT" },
  ASV: { name: "American Standard Version", shortName: "ASV" },
};
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
  static BookShortNames: string[] = BookShortNames;
  static bibleTranslations: { [translation: string]: bibleData } = {};
  static crossRefs: { [x: string]: never[] };
  static topics: BibleTopics;
  static Bookmarks: BibleTopics;
  static defaultTranslation: translation = "KJV";
  static get bible() {
    return this.bibleTranslations[this.defaultTranslation];
  }
  static get RandomVerse(): VerseRef {
    const book = VerseRef.booksOfTheBible[(Math.random() * (VerseRef.booksOfTheBible.length - 1)) | 0];
    if (!VerseRef.bibleTranslations.KJV) return new VerseRef(book, 1, 1);
    const chapter = Math.floor(Math.random() * (VerseRef.bibleTranslations.KJV[book].length - 2)) + 1;
    const verse = Math.floor(Math.random() * (VerseRef.bibleTranslations.KJV[book][chapter].length - 2)) + 1;
    return new VerseRef(book, chapter, verse);
  }

  constructor(public book: string = "GENESIS", public chapter: number = 1, public verse: number = 1) {}
  isSame(verse: VerseRef) {
    return this.book === verse.book && this.chapter === verse.chapter && this.verse === verse.verse;
  }
  text(translation: translation): string {
    return VerseRef.bibleTranslations[translation][this.book]?.[this.chapter]?.[this.verse] || "";
  }
  crossRefs(): VerseRef[] {
    const refs = VerseRef.crossRefs[this.toOSIS()] || [];
    return refs.map(ref => VerseRef.fromOSIS(ref[0] as string));
  }
  toOSIS(): string {
    const bookIndex = VerseRef.booksOfTheBible.indexOf(this.book);
    const bookCode = VerseRef.BookShortNames[bookIndex] || this.book;
    return `${bookCode}.${this.chapter}.${this.verse}`;
  }
  static fromOSIS(osis: string): VerseRef {
    const [from] = osis.split("-");
    const [book, chapter, verse] = from.split(".");
    return new VerseRef(
      VerseRef.booksOfTheBible[VerseRef.BookShortNames.indexOf(book)],
      parseInt(chapter),
      parseInt(verse)
    );
  }
  toString(): string {
    return `${this.book} ${this.chapter}:${this.verse}`;
  }
  verseData(translation: translation): string {
    return VerseRef.bibleTranslations[translation]?.[this.book]?.[this.chapter]?.[this.verse] || "";
  }
  chapterData(translation: translation): string[] {
    return VerseRef.bibleTranslations[translation]?.[this.book]?.[this.chapter] || [];
  }
  bookData(translation: translation): string[][] {
    return VerseRef.bibleTranslations[translation]?.[this.book] || [];
  }
  get vTXT(): string {
    return VerseRef.bible[this.book][this.chapter][this.verse] || "";
  }
  get cTXT(): string[] {
    return VerseRef.bible[this.book][this.chapter] || [];
  }
  get bTXT(): string[][] {
    return VerseRef.bible[this.book] || [];
  }
  set OSIS(osis: string) {
    const [[book, chapter, verse]] = osis.split("-").map(ft => ft.split("."));
    const newVerse = new VerseRef(
      VerseRef.booksOfTheBible[VerseRef.BookShortNames.indexOf(book)] || "GENESIS",
      parseInt(chapter ?? 1, 10),
      parseInt(verse ?? 1, 10)
    );
    this.book = newVerse.book;
    this.chapter = newVerse.chapter;
    this.verse = newVerse.verse;
  }
  get OSIS(): string {
    return this.toOSIS();
  }
}
