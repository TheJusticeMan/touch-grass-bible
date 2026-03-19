import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { VerseRef, type bibleData } from "../../models/VerseRef";
import {
  buildNaveIndex,
  findTopicsForVerse,
  getChildTopics,
  getReferenceStartVerse,
  getRelatedTopics,
  referenceContainsVerse,
  type NaveTopic,
} from "./NavesTopicalBibleData";

const originalTranslations = VerseRef.bibleTranslations;
const originalDefaultTranslation = VerseRef.defaultTranslation;

const testBible: bibleData = {
  GENESIS: [[], ["", "In the beginning", "And the earth"]],
  EXODUS: [[], ["", "Now these are the names"], ["", "And God spake"]],
  LEVITICUS: [[], ["", "And the LORD called unto Moses"]],
  JOHN: [
    [],
    ["", "In the beginning was the Word"],
    ["", "There was a man"],
    ["", "For God so loved", "For God sent not", "He that believeth"],
  ],
};

const sampleTopics: NaveTopic[] = [
  {
    title: "LOVE",
    verses: ["John.3.1-John.3.3"],
    relatedTopics: ["CHARITY"],
    subtopics: [
      {
        title: "God's love",
        verses: ["John.3"],
        relatedTopics: [],
        subtopics: [],
      },
    ],
  },
  {
    title: "CHARITY",
    verses: ["1Cor.13"],
    relatedTopics: [],
    subtopics: [],
  },
];

beforeEach(() => {
  VerseRef.bibleTranslations = {
    KJV: testBible,
  };
  VerseRef.defaultTranslation = "KJV";
});

afterEach(() => {
  VerseRef.bibleTranslations = originalTranslations;
  VerseRef.defaultTranslation = originalDefaultTranslation;
});

describe("NavesTopicalBibleData", () => {
  test("buildNaveIndex flattens topics and preserves navigation links", () => {
    const index = buildNaveIndex(sampleTopics);
    const loveTopic = index.topLevelByTitle.get("LOVE");

    expect(index.nodes).toHaveLength(3);
    expect(loveTopic?.fullTitle).toBe("LOVE");
    expect(getChildTopics(index, loveTopic!)[0]?.fullTitle).toBe("LOVE > God's love");
    expect(getRelatedTopics(index, loveTopic!).map(topic => topic.title)).toEqual(["CHARITY"]);
  });

  test("referenceContainsVerse matches exact ranges, chapters, and rejects misses", () => {
    expect(referenceContainsVerse("John.3.1-John.3.3", new VerseRef("JOHN", 3, 2))).toBe(true);
    expect(referenceContainsVerse("John.3", new VerseRef("JOHN", 3, 2))).toBe(true);
    expect(referenceContainsVerse("Exod", new VerseRef("EXODUS", 2, 1))).toBe(true);
    expect(referenceContainsVerse("John.3.1-John.3.3", new VerseRef("JOHN", 3, 4))).toBe(false);
  });

  test("getReferenceStartVerse returns the first verse in the Nave reference", () => {
    const verse = getReferenceStartVerse("John.3.1-John.3.3");

    expect(verse?.book).toBe("JOHN");
    expect(verse?.chapter).toBe(3);
    expect(verse?.verse).toBe(1);
  });

  test("findTopicsForVerse returns both parent and nested matching topics", () => {
    const index = buildNaveIndex(sampleTopics);
    const matches = findTopicsForVerse(index, new VerseRef("JOHN", 3, 2));

    expect(matches.map(topic => topic.fullTitle)).toEqual(["LOVE", "LOVE > God's love"]);
  });
});
