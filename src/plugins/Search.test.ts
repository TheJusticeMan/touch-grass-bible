import { describe, expect, test } from "vitest";
import type { bibleData } from "../models/VerseRef";
import { parseGoToVerseQuery } from "./searchParser.ts";

const books = ["JOHN", "JONAH", "GENESIS"];

const mockBible: bibleData = {
  JOHN: [[], ["", "John 1:1", "John 1:2"], ["", "John 2:1"], ["", "John 3:1", "John 3:2", "John 3:3"]],
  JONAH: [[], ["", "Jonah 1:1"], ["", "Jonah 2:1"]],
  GENESIS: [[], ["", "Genesis 1:1"]],
};

describe("parseGoToVerseQuery", () => {
  test("returns best-matching books for partial book input", () => {
    const result = parseGoToVerseQuery("jo", books, mockBible);
    expect(result).toEqual([{ book: "JOHN" }, { book: "JONAH" }]);
  });

  test("returns all chapters when book is fully matched", () => {
    const result = parseGoToVerseQuery("john", books, mockBible);
    expect(result).toEqual([
      { book: "JOHN", chapter: 1 },
      { book: "JOHN", chapter: 2 },
      { book: "JOHN", chapter: 3 },
    ]);
  });

  test("returns all verses in a matched chapter", () => {
    const result = parseGoToVerseQuery("john 3", books, mockBible);
    expect(result).toEqual([
      { book: "JOHN", chapter: 3, verse: 1 },
      { book: "JOHN", chapter: 3, verse: 2 },
      { book: "JOHN", chapter: 3, verse: 3 },
    ]);
  });

  test("parses chapter and verse with colon separator", () => {
    const result = parseGoToVerseQuery("john 3:2", books, mockBible);
    expect(result).toEqual([{ book: "JOHN", chapter: 3, verse: 2 }]);
  });

  test("parses chapter and verse with mixed punctuation", () => {
    const result = parseGoToVerseQuery("john:3,1", books, mockBible);
    expect(result).toEqual([{ book: "JOHN", chapter: 3, verse: 1 }]);
  });

  test("returns empty list when there is no match", () => {
    const result = parseGoToVerseQuery("zzz", books, mockBible);
    expect(result).toEqual([]);
  });
  test("returns empty list when there is no match", () => {
    const result = parseGoToVerseQuery("gzzz", books, mockBible);
    expect(result).toEqual([]);
  });
});
