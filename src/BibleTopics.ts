import { VerseRef } from "./VerseRef";

export type OSISString = string; // e.g., "JOHN.3.16"

type BibleTopicReference = [OSISString, number];
export type BibleTopicsType = { [topic: string]: BibleTopicReference[] };

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

  getTopicsFromVerse(verse: VerseRef): string[] {
    const osis = verse.toOSIS();
    return Array.from(this.topics.entries())
      .filter(([, refs]) => refs.has(osis))
      .map(([topic]) => topic);
  }

  addToHistory(verse: VerseRef): void {
    const today = this.CurrentDateLocal;
    this.add(today, verse);
  }

  private get CurrentDateLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  toJSON(): BibleTopicsType {
    const obj: BibleTopicsType = {};
    for (const [topic, refs] of this.topics.entries()) {
      obj[topic] = Array.from(refs.entries()).map(([osis, rating]) => [osis, rating]);
    }
    return obj;
  }
}
