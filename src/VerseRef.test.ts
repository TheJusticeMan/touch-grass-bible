import { describe, test, expect, beforeEach } from "vitest"
import { VerseRef } from "./VerseRef"

describe("VerseRef", () => {
  beforeEach(() => {
    VerseRef.myNotes = new Map()
  })

  test("constructor defaults to GENESIS 1:1", () => {
    const ref = new VerseRef()
    expect(ref.book).toBe("GENESIS")
    expect(ref.chapter).toBe(1)
    expect(ref.verse).toBe(1)
  })

  test("toOSIS converts correctly", () => {
    const ref = new VerseRef("GENESIS", 1, 1)
    expect(ref.toOSIS()).toBe("Gen.1.1")
  })

  test("toOSIS for JOHN 3:16", () => {
    const ref = new VerseRef("JOHN", 3, 16)
    expect(ref.toOSIS()).toBe("John.3.16")
  })

  test("fromOSIS parses correctly", () => {
    const ref = VerseRef.fromOSIS("John.3.16")
    expect(ref.book).toBe("JOHN")
    expect(ref.chapter).toBe(3)
    expect(ref.verse).toBe(16)
  })

  test("fromOSIS returns GENESIS 1:1 for unknown book code", () => {
    const ref = VerseRef.fromOSIS("Unknown.1.1")
    expect(ref.book).toBe("GENESIS")
    expect(ref.chapter).toBe(1)
    expect(ref.verse).toBe(1)
  })

  test("fromOSIS handles range (takes first part before dash)", () => {
    const ref = VerseRef.fromOSIS("John.3.16-John.3.17")
    expect(ref.book).toBe("JOHN")
    expect(ref.chapter).toBe(3)
    expect(ref.verse).toBe(16)
  })

  test("isSame returns true for identical verses", () => {
    const a = new VerseRef("JOHN", 3, 16)
    const b = new VerseRef("JOHN", 3, 16)
    expect(a.isSame(b)).toBe(true)
  })

  test("isSame returns false for different verses", () => {
    const a = new VerseRef("JOHN", 3, 16)
    const b = new VerseRef("JOHN", 3, 17)
    expect(a.isSame(b)).toBe(false)
  })

  test("isSameChapter returns true for same chapter", () => {
    const a = new VerseRef("JOHN", 3, 16)
    const b = new VerseRef("JOHN", 3, 1)
    expect(a.isSameChapter(b)).toBe(true)
  })

  test("note getter returns empty string when no note", () => {
    const ref = new VerseRef("JOHN", 3, 16)
    expect(ref.note).toBe("")
  })

  test("note setter stores note by OSIS key", () => {
    const ref = new VerseRef("JOHN", 3, 16)
    ref.note = "Test note"
    expect(VerseRef.myNotes.get("John.3.16")).toBe("Test note")
  })

  test("note setter deletes entry on whitespace-only value", () => {
    const ref = new VerseRef("JOHN", 3, 16)
    ref.note = "Something"
    ref.note = "   "
    expect(VerseRef.myNotes.has("John.3.16")).toBe(false)
  })

  test("toString returns human-readable format", () => {
    const ref = new VerseRef("GENESIS", 1, 1)
    expect(ref.toString()).toBe("Genesis 1:1")
  })

  test("OSIS setter updates book, chapter, verse", () => {
    const ref = new VerseRef("GENESIS", 1, 1)
    ref.OSIS = "John.3.16"
    expect(ref.book).toBe("JOHN")
    expect(ref.chapter).toBe(3)
    expect(ref.verse).toBe(16)
  })

  test("setVerse updates verse and returns self", () => {
    const ref = new VerseRef("JOHN", 3, 1)
    const result = ref.setVerse(16)
    expect(ref.verse).toBe(16)
    expect(result).toBe(ref)
  })
})
