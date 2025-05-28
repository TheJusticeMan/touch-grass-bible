import { BookShortNames, booksOfTheBible } from "./booksOfTheBible";
import { Highlighter } from "./external/App";
//import KJV from "./KJV.json";
/*
import CrossRefs from "../processing/crossrefsSample.json";
import Topics from "../processing/topicsSample.json";
// */
/*
import CrossRefs from "../processing/crossrefs.json";
import Topics from "../processing/topics.json";
//*/
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

export class VerseRef {
  static booksOfTheBible: string[] = booksOfTheBible;
  static BookShortNames: string[] = BookShortNames;
  /* static bible: { [translation: string]: bibleData } = { KJV: KJV as bibleData };
  static crossRefs = CrossRefs as { [osis: string]: (string | number)[][] };
  static topics = Topics as { [topic: string]: (string | number)[][] }; */
  static bible: { [translation: string]: bibleData } = {};
  static crossRefs: { [x: string]: never[] };
  static topics: { [x: string]: any[] };
  book: string;
  chapter: number;
  verse: number;

  constructor(book: string, chapter: number, verse: number) {
    this.book = book;
    this.chapter = chapter;
    this.verse = verse;
  }
  text(translation: string): string {
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
}
