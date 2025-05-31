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

export type translation = "KJV";
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
 *
 * Static methods:
 * - `fromOSIS(osis)`: Creates a `VerseRef` from an OSIS string.
 */
export class VerseRef {
  static booksOfTheBible: string[] = booksOfTheBible;
  static BookShortNames: string[] = BookShortNames;
  static bible: { [translation: string]: bibleData } = {};
  static crossRefs: { [x: string]: never[] };
  static topics: { [x: string]: string[] };
  static tags: { [x: string]: string[] } = {};
  static defaultTranslation: translation = "KJV";
  book: string;
  chapter: number;
  verse: number;

  constructor(book: string, chapter: number, verse: number) {
    this.book = book;
    this.chapter = chapter;
    this.verse = verse;
  }
  text(translation: translation): string {
    return VerseRef.bible[translation][this.book]?.[this.chapter]?.[this.verse] || "";
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
    const parts = osis.split("-");
    const [book, chapter, verse] = parts[0].split(".");
    const bookIndex = VerseRef.BookShortNames.indexOf(book);
    if (bookIndex === -1) throw new Error(`Invalid book code: ${book}`);
    return new VerseRef(VerseRef.booksOfTheBible[bookIndex], parseInt(chapter), parseInt(verse));
  }
  toString(): string {
    return `${this.book} ${this.chapter}:${this.verse}`;
  }
  verseData(translation: translation): string {
    return VerseRef.bible[translation]?.[this.book]?.[this.chapter]?.[this.verse] || "";
  }
  chapterData(translation: translation): string[] {
    return VerseRef.bible[translation]?.[this.book]?.[this.chapter] || [];
  }
  bookData(translation: translation): string[][] {
    return VerseRef.bible[translation]?.[this.book] || [];
  }
  get vTXT(): string {
    return this.verseData(VerseRef.defaultTranslation);
  }
  get cTXT(): string[] {
    return this.chapterData(VerseRef.defaultTranslation);
  }
  get bTXT(): string[][] {
    return this.bookData(VerseRef.defaultTranslation);
  }
}
