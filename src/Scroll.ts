import { scrollBubble } from "./external/App";
import { VerseRef } from "./VerseRef";

export class ChapterScroll extends scrollBubble {
  chapter: VerseRef;
  constructor(parent: HTMLElement, private cb: (book: VerseRef) => void) {
    super(parent);
    this.onScroll(this.cb);
  }

  show(chapter: VerseRef) {
    this.chapter = chapter;
    this.maxScroll = chapter.bTXT.length - 2;
    this.scroll = chapter.chapter - 1;
    this._show();
    return this;
  }

  setRef(chapter: VerseRef) {
    this.chapter = chapter;
    this.maxScroll = chapter.bTXT.length - 2;
    this.scroll = chapter.chapter - 1;
  }

  onScroll(cb: (chapter: VerseRef) => void) {
    this.clear("scroll");
    this.on("scroll", () => {
      if (!this.maxScroll) return;
      if (!this.chapter) return;
      const newChapter = new VerseRef(this.chapter.book, Math.round(this.scroll) + 1, 1);
      if (this.chapter.chapter === newChapter.chapter) return;
      this.chapter = newChapter;
      cb(this.chapter);
    });
  }
}

export class BookScroll extends scrollBubble {
  book: VerseRef;

  constructor(parent: HTMLElement, private cb: (book: VerseRef) => void) {
    super(parent);
  }

  show(book: VerseRef) {
    this.book = book;
    this.maxScroll = VerseRef.booksOfTheBible.length - 1;
    this.scroll = VerseRef.booksOfTheBible.indexOf(book.book);
    this.onScroll(this.cb);
    this._show();
    this.element!.style.right = "2em";
    return this;
  }

  setRef(book: VerseRef) {
    this.book = book;
    this.maxScroll = VerseRef.booksOfTheBible.length - 1;
    this.scroll = VerseRef.booksOfTheBible.indexOf(book.book);
  }

  onScroll(cb: (book: VerseRef) => void) {
    this.on("scroll", () => {
      if (!this.maxScroll) return;
      if (!this.book) return;
      const newBook = VerseRef.booksOfTheBible[Math.round(this.scroll)];
      if (newBook === this.book.book) return;
      this.book = new VerseRef(newBook, 1, 1);
      cb(this.book);
    });
  }
}
