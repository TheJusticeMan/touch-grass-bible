import { VerseRef } from "./VerseRef";

export class Ref {
  constructor(public from: VerseRef, public to: VerseRef) {}
  toOSIS(): string {
    return `${this.from.toOSIS()}-${this.to.toOSIS()}`;
  }
  static fromOSIS(osis: string): Ref {
    const [from, to] = osis
      .split("-")
      .map(ft => ft.split("."))
      .map(
        ([book, chapter, verse]) =>
          new VerseRef(
            VerseRef.booksOfTheBible[VerseRef.BookShortNames.indexOf(book)] ?? "",
            parseInt(chapter ?? 0, 10),
            parseInt(verse ?? 0, 10)
          )
      );
    const to2 = new VerseRef(to.book || from.book, to.chapter || from.chapter, to.verse || from.verse);
    return new Ref(from, to);
  }
}
