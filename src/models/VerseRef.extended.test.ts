/**
 * Additional VerseRef tests covering URL getters, chapter navigation,
 * and data accessors that require mock bible data.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { VerseRef } from "./VerseRef";

// ---------------------------------------------------------------------------
// Minimal mock bible data used throughout this suite.
// Index 0 of each book/chapter is a placeholder (indices are 1-based in usage).
// ---------------------------------------------------------------------------

// Book data: bookData[chapter][verse] — index 0 is unused placeholder
type MockBible = { [book: string]: string[][] };
type VerseRefPrivateCache = {
  _verseCount?: number;
  _versesBeforeIndex?: { [book: string]: number[] };
};

const makeMockBible = (): MockBible => ({
  // GENESIS: 3 chapters, up to 3 verses each
  GENESIS: [
    [],
    [
      "",
      "In the beginning God created...",
      "The earth was without form...",
      "And God said let there be light",
    ],
    ["", "Thus the heavens and the earth were finished...", "And on the seventh day God finished..."],
    ["", "These are the generations of the heavens..."],
  ],
  // EXODUS: 2 chapters
  EXODUS: [
    [],
    ["", "Now these are the names of the children...", "And every man and his household..."],
    ["", "And these are the names..."],
  ],
  // REVELATION: 2 chapters (last book — used for wrap-around tests)
  REVELATION: [
    [],
    ["", "The Revelation of Jesus Christ...", "Blessed is he who reads..."],
    ["", "To the angel of the church in Ephesus..."],
  ],
  // MALACHI: 1 chapter (last OT book, used for book boundary tests)
  MALACHI: [[], ["", "The burden of the word of the LORD..."]],
});

let originalTranslations: typeof VerseRef.bibleTranslations;
let originalDefault: typeof VerseRef.defaultTranslation;

beforeAll(() => {
  originalTranslations = VerseRef.bibleTranslations;
  originalDefault = VerseRef.defaultTranslation;
  VerseRef.bibleTranslations = { KJV: makeMockBible() };
  VerseRef.defaultTranslation = "KJV";
});

afterAll(() => {
  VerseRef.bibleTranslations = originalTranslations;
  VerseRef.defaultTranslation = originalDefault;
});

// ---------------------------------------------------------------------------
// toString / toChapterString
// ---------------------------------------------------------------------------

describe("VerseRef display strings", () => {
  test("toChapterString returns title-cased book and chapter", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.toChapterString()).toBe("Genesis 1");
  });
});

// ---------------------------------------------------------------------------
// URL getters
// ---------------------------------------------------------------------------

describe("VerseRef URL getters", () => {
  test("YouVersionURL is built from letter3 code", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    // books3letter[0] for GENESIS = "Gen"
    expect(ref.YouVersionURL).toBe("https://www.bible.com/bible/1/Gen.1.1");
  });

  test("blbURL uses letter3 code", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.blbURL).toBe("https://www.blueletterbible.org/kjv/Gen/1/1");
  });

  test("gatewayURL builds correct URL for normal book", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    const url = ref.gatewayURL;
    expect(url).toContain("biblegateway.com");
    expect(url).toContain("GENESIS");
    expect(url).toContain("1%3A1");
  });

  test("gatewayURL replaces SONG SOLOMON with SONG OF SOLOMON", () => {
    const ref = new VerseRef("SONG SOLOMON", 1, 1);
    const url = ref.gatewayURL;
    // The implementation rewrites "SONG SOLOMON" to "SONG OF SOLOMON" in the search path.
    // Spaces are not percent-encoded in this template-literal URL, so the check
    // is against the literal substring, not a '+'-encoded form.
    expect(url).toContain("SONG OF SOLOMON");
    // Ensure the unrewritten "SONG SOLOMON" is not present as the query book segment
    // (the '+' after is the separator between book name and chapter number in the URL)
    expect(url).not.toContain("SONG SOLOMON+");
  });
});

// ---------------------------------------------------------------------------
// letter3 getter
// ---------------------------------------------------------------------------

describe("VerseRef.letter3", () => {
  test("returns 3-letter code for a known book", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.letter3).toBe("Gen");
  });

  test("falls back to book name for unknown book", () => {
    const ref = new VerseRef("UNKNOWN_BOOK", 1, 1);
    expect(ref.letter3).toBe("UNKNOWN_BOOK");
  });
});

// ---------------------------------------------------------------------------
// Data accessors
// ---------------------------------------------------------------------------

describe("VerseRef data accessors", () => {
  test("verseData returns text for the given translation", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.verseData("KJV")).toBe("In the beginning God created...");
  });

  test("verseData returns empty string for unknown translation", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.verseData("ASV")).toBe("");
  });

  test("chapterData returns an array of verses for the chapter", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    const chapter = ref.chapterData("KJV");
    expect(Array.isArray(chapter)).toBe(true);
    expect(chapter[1]).toBe("In the beginning God created...");
  });

  test("chapterData returns empty array for unknown book", () => {
    const ref = new VerseRef("NOPE", 1, 1);
    expect(ref.chapterData("KJV")).toEqual([]);
  });

  test("bookData returns nested array for the book", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    const book = ref.bookData("KJV");
    expect(Array.isArray(book)).toBe(true);
    expect(book[1][1]).toBe("In the beginning God created...");
  });

  test("bookData returns empty array for unknown book", () => {
    const ref = new VerseRef("NOPE", 1, 1);
    expect(ref.bookData("KJV")).toEqual([]);
  });

  test("vTXT getter returns verse text from default translation", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.vTXT).toBe("In the beginning God created...");
  });

  test("cTXT getter returns chapter array from default translation", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(Array.isArray(ref.cTXT)).toBe(true);
  });

  test("bTXT getter returns book array from default translation", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(Array.isArray(ref.bTXT)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chapter navigation
// ---------------------------------------------------------------------------

describe("VerseRef.nextChapter", () => {
  test("returns the next chapter in the same book", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    const next = ref.nextChapter;
    expect(next.book).toBe("GENESIS");
    expect(next.chapter).toBe(2);
    expect(next.verse).toBe(1);
  });

  test("advances to the next book when on the last chapter", () => {
    // GENESIS has chapters 1-3, so chapter 3 is last
    const ref = new VerseRef("GENESIS", 3, 1);
    const next = ref.nextChapter;
    expect(next.book).toBe("EXODUS");
    expect(next.chapter).toBe(1);
  });
});

describe("VerseRef.distance", () => {
  test("recomputes against loaded bible data after an empty start", () => {
    const originalTranslations = VerseRef.bibleTranslations;
    const verseRefCache = VerseRef as unknown as VerseRefPrivateCache;
    const originalVerseCount = verseRefCache._verseCount;
    const originalVersesBeforeIndex = verseRefCache._versesBeforeIndex;

    try {
      VerseRef.bibleTranslations = {};
      verseRefCache._verseCount = undefined;
      verseRefCache._versesBeforeIndex = undefined;

      expect(VerseRef.distance(0)).toEqual(new VerseRef("GENESIS", 1, 1));

      VerseRef.bibleTranslations = { KJV: makeMockBible() };
      expect(VerseRef.distance(1)).toEqual(new VerseRef("REVELATION", 2, 1));
    } finally {
      VerseRef.bibleTranslations = originalTranslations;
      verseRefCache._verseCount = originalVerseCount;
      verseRefCache._versesBeforeIndex = originalVersesBeforeIndex;
    }
  });
});

describe("VerseRef.prevChapter", () => {
  test("returns the previous chapter in the same book", () => {
    const ref = new VerseRef("GENESIS", 2, 1);
    const prev = ref.prevChapter;
    expect(prev.book).toBe("GENESIS");
    expect(prev.chapter).toBe(1);
  });

  test("wraps to the last chapter of the previous book when on chapter 1", () => {
    const ref = new VerseRef("EXODUS", 1, 1);
    const prev = ref.prevChapter;
    expect(prev.book).toBe("GENESIS");
    expect(prev.chapter).toBe(3);
  });
});

describe("VerseRef.Chapteroffset", () => {
  test("positive offset advances chapters within a book", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    const advanced = ref.Chapteroffset(2);
    expect(advanced.book).toBe("GENESIS");
    expect(advanced.chapter).toBe(3);
  });

  test("zero offset returns the same chapter", () => {
    const ref = new VerseRef("GENESIS", 2, 1);
    const same = ref.Chapteroffset(0);
    expect(same.book).toBe("GENESIS");
    expect(same.chapter).toBe(2);
  });

  test("offset crossing a book boundary advances to next book", () => {
    // GENESIS has chapters 1-3; offset of 3 from chapter 1 crosses into EXODUS
    const ref = new VerseRef("GENESIS", 1, 1);
    const advanced = ref.Chapteroffset(3);
    expect(advanced.book).toBe("EXODUS");
  });

  test("negative offset retreats chapters within a book", () => {
    const ref = new VerseRef("GENESIS", 3, 1);
    const retreated = ref.Chapteroffset(-2);
    expect(retreated.book).toBe("GENESIS");
    expect(retreated.chapter).toBe(1);
  });
});
