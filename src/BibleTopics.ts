import { VerseRef } from "./VerseRef";

export type OSISString = string; // e.g., "JOHN.3.16"

type BibleTopicReference = [OSISString, number];
export type BibleTopicsType = {
  [topic: string]: BibleTopicReference[];
};

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

export class BibleTopics {
  private topics: Map<string, BibleTopicReference[]>;

  constructor(data: BibleTopicsType) {
    // Copy object data to map to avoid mutating the original
    this.topics = new Map<string, BibleTopicReference[]>(
      Object.entries(data).map(([topic, refs]) => [topic, refs.slice()])
    );
  }

  addData(data: BibleTopicsType): void {
    for (const [topic, refs] of Object.entries(data)) {
      if (!this.topics.has(topic)) {
        this.topics.set(topic, refs.slice());
      } else {
        // If topic exists, append new refs and remove duplicates
        this.topics.set(topic, [...this.topics.get(topic)!, ...refs].slice());
        this.removeDuplicateRefs(topic);
      }
    }
  }

  /** List all topic names */
  get topicNames(): string[] {
    return Array.from(this.topics.keys());
  }

  /** Check if a topic exists */
  has(topic: string): boolean {
    return this.topics.has(topic);
  }

  /**
   * Get the VerseRefs for a topic.
   * (You might want to provide raw refs too—see getRawRefsForTopic below)
   */
  get(topic: string): VerseRef[] {
    return this.topics.get(topic)?.map(([osis, _rating]) => VerseRef.fromOSIS(osis)) || [];
  }

  /** Get raw [OSIS, rating] pairs for a topic */
  getRawRefsForTopic(topic: string): BibleTopicReference[] {
    return this.topics.get(topic)?.slice() || [];
  }

  /**
   * Add VerseRefs to a topic (rating default 0).
   * Skips duplicates (keeps latest provided).
   */
  saveToTopic(topic: string, ...refs: VerseRef[]): void {
    this.topics.set(topic, [
      ...(this.topics.get(topic) ?? []),
      ...refs.map<BibleTopicReference>(ref => [ref.toOSIS(), 0]),
    ]);
    this.removeDuplicateRefs(topic);
  }

  /**
   * Set (overwrite) all references for a topic.
   * @param refs - List of VerseRefs to set (ratings default to 0)
   */
  set(topic: string, ...refs: VerseRef[]): void {
    this.topics.delete(topic);
    this.topics.set(
      topic,
      refs.map(ref => [ref.toOSIS(), 0])
    );
    this.removeDuplicateRefs(topic);
  }

  delete(topic: string): void {
    this.topics.delete(topic);
  }

  removeFromTopic(topic: string, ...refs: VerseRef[]): void {
    if (!this.topics.has(topic)) return;
    const currentRefs = this.topics.get(topic)!;
    const osisSet = new Set(refs.map(ref => ref.toOSIS()));
    // Filter out any refs that match the provided OSIS strings
    const updatedRefs = currentRefs.filter(([osis]) => !osisSet.has(osis));
    this.topics.delete(topic);
    this.topics.set(topic, updatedRefs);
  }

  /**
   * Remove duplicates for a topic (keep only last for each OSIS)
   */
  removeDuplicateRefs(topic: string): void {
    if (!this.topics.has(topic)) return;
    const refs = this.topics.get(topic)!;
    const unique = new Map<string, BibleTopicReference>();
    // Keeps the LAST occurrence
    for (const ref of refs) unique.set(ref[0], ref);
    this.topics.delete(topic);
    this.topics.set(topic, Array.from(unique.values()));
  }

  /** Find all topics mentioning a given OSIS string */
  TopicsWithVerse(verse: VerseRef): string[] {
    const matches: string[] = [];
    const osisStr = verse.toOSIS();
    for (const [topic, refs] of this.topics.entries()) {
      if (refs.some(([refOsis]) => refOsis === osisStr)) matches.push(topic);
    }
    return matches;
  }

  /** Export as plain object for saving or serialization */
  toJSON(): BibleTopicsType {
    const obj: BibleTopicsType = {};
    for (const [topic, refs] of this.topics.entries()) {
      obj[topic] = refs.slice();
    }
    return obj;
  }

  addToHistory(verse: VerseRef): void {
    // get the current day rounded to the nearest date as a number
    const [today] = new Date().toISOString().split("T");
    this.saveToTopic(today, verse);
    console.log(`Added ${verse.toString()} to history for ${today}`);
    console.log(new Date(today).toISOString(), ":", today);
  }
}
