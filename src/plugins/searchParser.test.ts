import { describe, expect, test } from "vitest";
import type { bibleData } from "../models/VerseRef";
import { parseGoToVerseQuery } from "./searchParser.ts";

const books = ["GENESIS", "JOHN", "JONAH"];

const mockBible: bibleData = {
  GENESIS: [[], ["", "Genesis 1:1"], ["", "Genesis 2:1", "Genesis 2:2"], ["", "Genesis 3:1", "Genesis 3:2"]],
  JOHN: [[], ["", "John 1:1"], ["", "John 2:1"], ["", "John 3:1", "John 3:2", "John 3:3"]],
  JONAH: [[], ["", "Jonah 1:1"], ["", "Jonah 2:1"]],
};

describe("parseGoToVerseQuery", () => {
  test("returns all chapters for a fully matched book", () => {
    expect(parseGoToVerseQuery("john", books, mockBible)).toEqual([
      { book: "JOHN", chapter: 1 },
      { book: "JOHN", chapter: 2 },
      { book: "JOHN", chapter: 3 },
    ]);
  });

  test("accepts a chapter-only query with trailing punctuation", () => {
    expect(parseGoToVerseQuery("genesis 1, ", books, mockBible)).toEqual([{ book: "GENESIS", chapter: 1 }]);
  });

  test("parses chapter and verse from mixed punctuation", () => {
    expect(parseGoToVerseQuery("john:3,1", books, mockBible)).toEqual([
      { book: "JOHN", chapter: 3, verse: 1 },
    ]);
  });

  test("matches the nearest valid book when the input is partial", () => {
    expect(parseGoToVerseQuery("jo", books, mockBible)).toEqual([{ book: "JOHN" }, { book: "JONAH" }]);
  });

  test("returns all verses in a matched chapter when verse is omitted", () => {
    expect(parseGoToVerseQuery("john 3", books, mockBible)).toEqual([
      { book: "JOHN", chapter: 3, verse: 1 },
      { book: "JOHN", chapter: 3, verse: 2 },
      { book: "JOHN", chapter: 3, verse: 3 },
    ]);
  });

  test("supports strict numeric parsing when the query continues after the chapter", () => {
    expect(parseGoToVerseQuery("ge1,1", books, mockBible)).toEqual([
      { book: "GENESIS", chapter: 1, verse: 1 },
    ]);
  });

  test("accepts a short book prefix followed by a chapter number", () => {
    expect(parseGoToVerseQuery("ge1", books, mockBible)).toEqual([{ book: "GENESIS", chapter: 1, verse: 1 }]);
  });

  test("returns the closest valid chapter and verse candidates for out-of-range inputs", () => {
    expect(parseGoToVerseQuery("genesis 99", books, mockBible)).toEqual([
      { book: "GENESIS", chapter: 1 },
      { book: "GENESIS", chapter: 2 },
      { book: "GENESIS", chapter: 3 },
    ]);
    expect(parseGoToVerseQuery("john 3:99", books, mockBible)).toEqual([
      { book: "JOHN", chapter: 3, verse: 1 },
      { book: "JOHN", chapter: 3, verse: 2 },
      { book: "JOHN", chapter: 3, verse: 3 },
    ]);
  });

  test("returns an empty result when the book cannot be matched", () => {
    expect(parseGoToVerseQuery("gzzz", books, mockBible)).toEqual([]);
  });
});
