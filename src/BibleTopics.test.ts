import { describe, test, expect, beforeEach } from "vitest"
import { BibleTopics } from "./BibleTopics"
import { VerseRef } from "./VerseRef"

describe("BibleTopics", () => {
  beforeEach(() => {
    VerseRef.myNotes = new Map()
  })

  test("constructor with empty data creates empty topics", () => {
    const topics = new BibleTopics({})
    expect(topics.keys).toHaveLength(0)
  })

  test("add creates topic on first add", () => {
    const topics = new BibleTopics({})
    const ref = new VerseRef("JOHN", 3, 16)
    topics.add("Favorites", ref)
    expect(topics.has("Favorites")).toBe(true)
    expect(topics.get("Favorites")).toHaveLength(1)
  })

  test("add to existing topic appends ref", () => {
    const topics = new BibleTopics({})
    const ref1 = new VerseRef("JOHN", 3, 16)
    const ref2 = new VerseRef("GENESIS", 1, 1)
    topics.add("Favorites", ref1)
    topics.add("Favorites", ref2)
    expect(topics.get("Favorites")).toHaveLength(2)
  })

  test("remove deletes topic when no verses remain", () => {
    const ref = new VerseRef("JOHN", 3, 16)
    const topics = new BibleTopics({
      Favorites: [["John.3.16", 0]],
    })
    topics.remove("Favorites", ref)
    expect(topics.has("Favorites")).toBe(false)
  })

  test("remove does nothing if topic does not exist", () => {
    const topics = new BibleTopics({})
    const ref = new VerseRef("JOHN", 3, 16)
    expect(() => topics.remove("NonExistent", ref)).not.toThrow()
  })

  test("has returns false for non-existent topic", () => {
    const topics = new BibleTopics({})
    expect(topics.has("NonExistent")).toBe(false)
  })

  test("get returns empty array for non-existent topic", () => {
    const topics = new BibleTopics({})
    expect(topics.get("NonExistent")).toHaveLength(0)
  })

  test("getTopicsFromVerse finds correct topics", () => {
    const data = {
      Faith: [["Heb.11.1", 0] as [string, number]],
      Salvation: [
        ["John.3.16", 0] as [string, number],
        ["Heb.11.1", 0] as [string, number],
      ],
    }
    const topics = new BibleTopics(data)
    const result = topics.getTopicsFromVerse(new VerseRef("HEBREWS", 11, 1))
    expect(result).toContain("Faith")
    expect(result).toContain("Salvation")
  })

  test("getTopicsFromVerse returns empty for verse with no topics", () => {
    const topics = new BibleTopics({})
    const result = topics.getTopicsFromVerse(new VerseRef("JOHN", 3, 16))
    expect(result).toHaveLength(0)
  })

  test("toJSON roundtrips correctly", () => {
    const data = { Test: [["Gen.1.1", 5] as [string, number]] }
    const topics = new BibleTopics(data)
    expect(topics.toJSON()).toEqual(data)
  })

  test("delete removes topic", () => {
    const topics = new BibleTopics({ Test: [["Gen.1.1", 0]] })
    topics.delete("Test")
    expect(topics.has("Test")).toBe(false)
  })

  test("addData merges new topics", () => {
    const topics = new BibleTopics({ A: [["Gen.1.1", 0]] })
    topics.addData({ B: [["John.3.16", 0]] })
    expect(topics.has("A")).toBe(true)
    expect(topics.has("B")).toBe(true)
  })
})
