import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/* type NaveTopic = {
  title: string;
  subtopics: NaveTopic[];
  verses: string[];
  relatedTopics: string[];
}; */

const allowedKeys = ["relatedTopics", "subtopics", "title", "verses"];
// eslint-disable-next-line security/detect-unsafe-regex
const verseReferencePattern = /^[1-3]?[A-Za-z]+(?:\.\d+){0,2}(?:-[1-3]?[A-Za-z]+(?:\.\d+){0,2})?$/;

function getParsedNaveFilePath(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  return path.resolve(currentDir, "../data/parsed-nave.json");
}

function validateTopic(topic: unknown, pathLabel: string): void {
  expect(topic, `${pathLabel} should be an object`).toBeTypeOf("object");
  expect(Array.isArray(topic), `${pathLabel} should not be an array`).toBe(false);
  expect(topic, `${pathLabel} should not be null`).not.toBeNull();

  const topicRecord = topic as Record<string, unknown>;
  const topicKeys = Object.keys(topicRecord).sort();

  expect(topicKeys, `${pathLabel} has unexpected keys`).toEqual(allowedKeys);
  expect(topicRecord.title, `${pathLabel}.title should be a string`).toBeTypeOf("string");
  expect(topicRecord.title, `${pathLabel}.title should not be empty`).not.toBe("");
  expect(topicRecord.subtopics, `${pathLabel}.subtopics should be an array`).toBeInstanceOf(Array);
  expect(topicRecord.verses, `${pathLabel}.verses should be an array`).toBeInstanceOf(Array);
  expect(topicRecord.relatedTopics, `${pathLabel}.relatedTopics should be an array`).toBeInstanceOf(Array);

  for (const [index, subtopic] of (topicRecord.subtopics as unknown[]).entries()) {
    validateTopic(subtopic, `${pathLabel}.subtopics[${index}]`);
  }

  for (const [index, verse] of (topicRecord.verses as unknown[]).entries()) {
    expect(verse, `${pathLabel}.verses[${index}] should be a string`).toBeTypeOf("string");
    expect(verse, `${pathLabel}.verses[${index}] should not be empty`).not.toBe("");
    expect(
      verseReferencePattern.test(verse as string),
      `${pathLabel}.verses[${index}] should use an OSIS-like reference format`,
    ).toBe(true);
  }

  for (const [index, relatedTopic] of (topicRecord.relatedTopics as unknown[]).entries()) {
    expect(relatedTopic, `${pathLabel}.relatedTopics[${index}] should be a string`).toBeTypeOf("string");
    expect(relatedTopic, `${pathLabel}.relatedTopics[${index}] should not be empty`).not.toBe("");
  }
}

describe("parsed-nave.json", () => {
  test("matches the expected recursive topic format", () => {
    const filePath = getParsedNaveFilePath();
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const rawJson = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(rawJson) as unknown;

    expect(parsed).toBeInstanceOf(Array);
    expect((parsed as unknown[]).length).toBeGreaterThan(0);

    for (const [index, topic] of (parsed as unknown[]).entries()) {
      validateTopic(topic, `parsedNave[${index}]`);
    }
  });
});
