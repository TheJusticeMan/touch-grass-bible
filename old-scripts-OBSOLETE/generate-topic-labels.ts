/**
 * Generates short topic labels from the center verses produced by
 * generate-topic-center-verses.ts.
 *
 * Usage:
 *   npm run generate:topic-labels
 *
 * Env overrides:
 *   TOPIC_CENTERS_PATH   topic centers JSON      (default: data/bible-topic-centers.json)
 *   TOPIC_LABELS_OUTPUT  output JSON path        (default: data/bible-topic-labels.json)
 *   LABEL_PROVIDER       openai | ollama         (default: ollama)
 *   OPENAI_BASE_URL      OpenAI base URL         (default: https://api.openai.com/v1)
 *   OPENAI_API_KEY       OpenAI API key          (required for openai)
 *   LABEL_OPENAI_MODEL   OpenAI chat model       (default: gpt-4.1-mini)
 *   LABEL_OLLAMA_URL     Ollama chat endpoint    (default: http://localhost:11434/api/chat)
 *   LABEL_OLLAMA_MODEL   Ollama chat model       (default: qwen3:8b)
 */

import { readFileSync, writeFileSync } from "fs";
import type {
  DataTopicCenterVerse,
  DataTopicCentersFile,
  DataTopicLabelsFile,
} from "../src/models/DataTypes";

type Provider = "openai" | "ollama";

type TopicCentersInput = DataTopicCentersFile;

type TopicLabelResult = {
  label: string;
  description: string;
};

type TopicLabelsOutput = DataTopicLabelsFile;

const TOPIC_CENTERS_PATH = process.env.TOPIC_CENTERS_PATH ?? "data/bible-topic-centers.json";
const OUTPUT_PATH = process.env.TOPIC_LABELS_OUTPUT ?? "data/bible-topic-labels.json";
const LABEL_PROVIDER = ((process.env.LABEL_PROVIDER ?? "ollama").toLowerCase() as Provider) || "ollama";

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const LABEL_OPENAI_MODEL = process.env.LABEL_OPENAI_MODEL ?? "gpt-4.1-mini";

const LABEL_OLLAMA_URL = process.env.LABEL_OLLAMA_URL ?? "http://localhost:11434/api/chat";
const LABEL_OLLAMA_MODEL = process.env.LABEL_OLLAMA_MODEL ?? "qwen3.5:2b";

function buildPrompt(centerVerses: DataTopicCenterVerse[]): string {
  const examples = centerVerses
    .map(verse => `${verse.book} ${verse.chapter}:${verse.verse} - ${verse.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  return [
    "You are labeling a cluster of Bible verses.",
    "Infer the shared theme across the examples and produce a concise label.",
    "Requirements:",
    "- label: 2 to 5 words, Title Case",
    "- description: one short sentence explaining the shared theme",
    "- avoid mentioning book names or verse numbers in the label",
    "- do not use vague labels like Bible Topic or Miscellaneous",
    'Return strict JSON with keys "label" and "description" only.',
    "",
    examples,
  ].join("\n");
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Model did not return JSON: ${text}`);
  }

  return text.slice(start, end + 1);
}

function normalizeLabelResult(value: unknown): TopicLabelResult {
  if (!value || typeof value !== "object") {
    throw new Error("Label response must be an object");
  }

  const candidate = value as { label?: unknown; description?: unknown };
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";

  if (!label) {
    throw new Error("Label response is missing a non-empty label");
  }

  return {
    label,
    description,
  };
}

async function generateOpenAILabel(prompt: string): Promise<TopicLabelResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when LABEL_PROVIDER=openai");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LABEL_OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You label clusters of Bible verses and return strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI label request failed: ${response.status} ${response.statusText} ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI label response missing choices[0].message.content");
  }

  return normalizeLabelResult(JSON.parse(extractJsonObject(content)) as unknown);
}

async function generateOllamaLabel(prompt: string): Promise<TopicLabelResult> {
  const response = await fetch(LABEL_OLLAMA_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LABEL_OLLAMA_MODEL,
      stream: false,
      format: "json",
      messages: [
        {
          role: "system",
          content: "You label clusters of Bible verses and return strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama label request failed: ${response.status} ${response.statusText} ${body}`);
  }

  const payload = (await response.json()) as {
    message?: {
      content?: string;
    };
  };

  const content = payload.message?.content;
  if (!content) {
    throw new Error("Ollama label response missing message.content");
  }

  return normalizeLabelResult(JSON.parse(extractJsonObject(content)) as unknown);
}

async function generateLabel(prompt: string): Promise<TopicLabelResult> {
  if (LABEL_PROVIDER === "openai") {
    return generateOpenAILabel(prompt);
  }

  return generateOllamaLabel(prompt);
}

async function run(): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const input = JSON.parse(readFileSync(TOPIC_CENTERS_PATH, "utf8")) as TopicCentersInput;

  const topics = [] as TopicLabelsOutput["topics"];
  for (let i = 0; i < input.topics.length; i++) {
    const entry = input.topics[i];
    const prompt = buildPrompt(entry.centerVerses);
    console.log(`Labeling topic ${entry.topic} (${i + 1}/${input.topics.length}) ...`);
    const result = await generateLabel(prompt);

    topics.push({
      topic: entry.topic,
      size: entry.size,
      label: result.label,
      description: result.description,
      centerVerses: entry.centerVerses,
    });
  }

  const output: TopicLabelsOutput = {
    provider: LABEL_PROVIDER,
    model: LABEL_PROVIDER === "openai" ? LABEL_OPENAI_MODEL : LABEL_OLLAMA_MODEL,
    topics,
  };

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote ${topics.length} topic labels -> ${OUTPUT_PATH}`);
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
