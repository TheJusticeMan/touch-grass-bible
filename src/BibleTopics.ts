import { VerseRef } from "./VerseRef";

export type OSISString = string; // e.g., "JOHN.3.16"

type BibleTopicReference = [OSISString, number];
export type BibleTopicsType = { [topic: string]: BibleTopicReference[] };

const BibleTopicsExmp: BibleTopicsType = {
  "666": [
    ["Rev.13.18", 10],
    ["Rev.13.1-Rev.13.18", 6],
    ["Rev.13.16-Rev.13.18", 5],
    ["Rev.13.17", 2],
    ["2Chr.9.13", 2],
    ["Rev.12.1-Rev.12.17", 2],
    ["Rev.14.1-Rev.14.20", 2],
    ["Rev.20.4", 2],
    ["Rev.13.16", 2],
    ["Rev.13.8", 2],
  ],
  "911": [["Isa.30.25", 9]],
  "2012": [["Matt.24.36", 39]],
  "10 commandments": [
    ["Exod.20.1-Exod.20.26", 7],
    ["Gal.5.14", 3],
    ["Rom.13.8-Rom.13.10", 3],
    ["Deut.4.13", 2],
    ["Exod.34.28", 2],
    ["Exod.20.13", 2],
    ["Exod.20.14", 2],
    ["Luke.6.27-Luke.6.33", 2],
  ],
};

/**
 * Manages a collection of Bible topics, each associated with a set of verse references and optional ratings.
 *
 * The `BibleTopics` class allows you to add, retrieve, update, and remove topics and their associated verse references.
 * Each topic is mapped to a set of verse references (in OSIS string format) with an optional numeric rating.
 *
 * @example
 * ```typescript
 * const topics = new BibleTopics(initialData);
 * topics.add("Faith", new VerseRef("HEBREWS", 11, 1));
 * const verses = topics.get("Faith");
 * ```
 *
 * @remarks
 * - Topics are stored as a map from topic names to a map of OSIS strings and ratings.
 * - Ratings default to 0 when not specified.
 * - Provides methods for serialization and deserialization via `toJSON`.
 *
 * @typeParam OSISString - The string type representing OSIS verse references.
 * @typeParam BibleTopicsType - The type representing the structure of the topics data.
 * @typeParam VerseRef - The class representing a verse reference, which must provide `fromOSIS` and `toOSIS` methods.
 */
export class BibleTopics {
  private topics: Map<string, Map<OSISString, number>>;
  constructor(data: BibleTopicsType) {
    this.topics = new Map<string, Map<OSISString, number>>();
    for (const [topic, refs] of Object.entries(data)) {
      const refMap = new Map<OSISString, number>();
      for (const [osis, rating] of refs) {
        refMap.set(osis, rating);
      }
      this.topics.set(topic, refMap);
    }
  }

  addData(data: BibleTopicsType): void {
    for (const [topic, refs] of Object.entries(data)) {
      if (!this.topics.has(topic)) {
        const refMap = new Map<OSISString, number>();
        for (const [osis, rating] of refs) {
          refMap.set(osis, rating);
        }
        this.topics.set(topic, refMap);
      } else {
        const existingRefs = this.topics.get(topic)!;
        for (const [osis, rating] of refs) {
          existingRefs.set(osis, rating);
        }
      }
    }
  }

  get(topic: string): VerseRef[] {
    const refs = this.topics.get(topic);
    if (!refs) return [];
    return Array.from(refs.keys()).map(osis => VerseRef.fromOSIS(osis));
  }

  has(topic: string): boolean {
    return this.topics.has(topic);
  }

  set(topic: string, ...refs: VerseRef[]): void {
    const refMap = new Map<OSISString, number>();
    for (const ref of refs) {
      refMap.set(ref.toOSIS(), 0); // Default rating to 0
    }
    this.topics.set(topic, refMap);
  }

  add(topic: string, ...refs: VerseRef[]): void {
    if (!this.topics.has(topic)) {
      this.set(topic, ...refs);
    } else {
      const existingRefs = this.topics.get(topic)!;
      for (const ref of refs) {
        existingRefs.set(ref.toOSIS(), 0); // Default rating to 0
      }
    }
  }

  remove(topic: string, ...refs: VerseRef[]): void {
    if (!this.topics.has(topic)) return;
    const existingRefs = this.topics.get(topic)!;
    for (const ref of refs) {
      existingRefs.delete(ref.toOSIS());
    }
    // If no refs left, delete the topic
    if (existingRefs.size === 0) {
      this.topics.delete(topic);
    }
  }

  delete(topic: string): void {
    this.topics.delete(topic);
  }

  get keys(): string[] {
    return Array.from(this.topics.keys());
  }

  addToHistory(verse: VerseRef): void {
    const [today] = new Date().toISOString().split("T");
    this.add(today, verse);
  }

  toJSON(): BibleTopicsType {
    const obj: BibleTopicsType = {};
    for (const [topic, refs] of this.topics.entries()) {
      obj[topic] = Array.from(refs.entries()).map(([osis, rating]) => [osis, rating]);
    }
    return obj;
  }
}
