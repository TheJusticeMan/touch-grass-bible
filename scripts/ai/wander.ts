import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { BookShortNames, booksOfTheBible } from "../../src/models/booksOfTheBible";

/* eslint-disable security/detect-non-literal-fs-filename */

type CrossRefs = Record<string, Array<[string, number]>>;
type BibleData = Record<string, Array<Array<string | null> | null>>;
type TouchMode = "read" | "edit";
type TraversalMode = "balanced" | "novelty" | "vote-biased" | "chapter-local";

interface WalkerState {
  currentOsis: string;
  step: number;
  visitCounts: Record<string, number>;
  recentPath: string[];
  startedAt: string;
  updatedAt: string;
}

interface FileIndex {
  files: Record<string, { mode: TouchMode; touchedAt: string; touchCount: number }>;
}

const ROOT = process.cwd();
const AI_DIR = join(ROOT, "ai");
const WALKS_DIR = join(AI_DIR, "walks");
const STATE_PATH = join(AI_DIR, "wander-state.json");
const FILE_INDEX_PATH = join(AI_DIR, "file-index.json");
const FILE_EVENTS_PATH = join(AI_DIR, "file-events.jsonl");
const RUN_LOG_PATH = join(AI_DIR, "wander.log");

const KJV_PATH = join(ROOT, "data", "translations", "KJV.json");
const CROSSFREFS_PATH_CANDIDATES = [
  join(ROOT, "dist", "assets", "crossrefs.json"),
  join(ROOT, "dist", "crossrefs.json"),
  join(ROOT, "data", "crossrefs.json"),
];

const MODEL = process.env.OLLAMA_MODEL || "gemma4:12b-it-qat";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const START_OSIS = process.env.START_OSIS || "John.3.16";
const STEP_DELAY_MS = Number.parseInt(process.env.STEP_DELAY_MS || "2500", 10);
const MAX_STEPS = Number.parseInt(process.env.MAX_STEPS || "0", 10);
const MAX_RECENT = 12;
const HISTORY_RECENT_NOTES = Number.parseInt(process.env.HISTORY_RECENT_NOTES || "5", 10);
const HISTORY_RANDOM_NOTES = Number.parseInt(process.env.HISTORY_RANDOM_NOTES || "3", 10);
const NOTE_EXCERPT_CHARS = Number.parseInt(process.env.NOTE_EXCERPT_CHARS || "700", 10);
const TRAVERSAL_MODE = (process.env.TRAVERSAL_MODE || "balanced").toLowerCase() as TraversalMode;

const validModes: TraversalMode[] = ["balanced", "novelty", "vote-biased", "chapter-local"];
if (!validModes.includes(TRAVERSAL_MODE)) {
  throw new Error(`Invalid TRAVERSAL_MODE=${TRAVERSAL_MODE}. Expected one of: ${validModes.join(", ")}`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeVerseText(value: string): string {
  return value.replace(/^#\s*/u, "").replace(/\s+/gu, " ").trim();
}

function titleCaseBook(book: string): string {
  return book
    .toLowerCase()
    .split(" ")
    .map(part => (part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function parseOSIS(osisRaw: string): { osis: string; book: string; chapter: number; verse: number } | null {
  const osis = osisRaw.split("-")[0];
  const parts = osis.split(".");
  if (parts.length < 3) return null;

  const [bookCode, chapterRaw, verseRaw] = parts;
  const bookIndex = BookShortNames.indexOf(bookCode);
  if (bookIndex < 0) return null;

  const chapter = Number.parseInt(chapterRaw || "1", 10);
  const verse = Number.parseInt(verseRaw || "1", 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;

  return {
    osis,
    book: booksOfTheBible[bookIndex],
    chapter,
    verse,
  };
}

function isSameChapter(a: string, b: string): boolean {
  const pa = parseOSIS(a);
  const pb = parseOSIS(b);
  if (!pa || !pb) return false;
  return pa.book === pb.book && pa.chapter === pb.chapter;
}

function getVerseText(kjv: BibleData, osis: string): string {
  const parsed = parseOSIS(osis);
  if (!parsed) return "";
  const chapterData = kjv[parsed.book]?.[parsed.chapter];
  if (!Array.isArray(chapterData)) return "";
  const verseText = chapterData[parsed.verse];
  return typeof verseText === "string" ? normalizeVerseText(verseText) : "";
}

function toHumanRef(osis: string): string {
  const parsed = parseOSIS(osis);
  if (!parsed) return osis;
  return `${titleCaseBook(parsed.book)} ${parsed.chapter}:${parsed.verse}`;
}

function sanitizeForFile(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function weightedPick(edges: Array<[string, number]>): string | null {
  const valid = edges.filter(edge => edge[0] && Number.isFinite(edge[1]) && edge[1] > 0);
  if (valid.length === 0) return null;

  const totalWeight = valid.reduce((sum, [, votes]) => sum + votes, 0);
  let target = Math.random() * totalWeight;

  for (const [osis, votes] of valid) {
    target -= votes;
    if (target <= 0) return osis;
  }

  return valid[valid.length - 1]?.[0] ?? null;
}

function weightedPickWithScore(
  edges: Array<[string, number]>,
  score: (edge: [string, number]) => number,
): string | null {
  const scored = edges
    .map(edge => ({
      osis: edge[0],
      score: score(edge),
    }))
    .filter(item => item.osis && Number.isFinite(item.score) && item.score > 0);

  if (scored.length === 0) return null;

  const totalWeight = scored.reduce((sum, item) => sum + item.score, 0);
  let target = Math.random() * totalWeight;

  for (const item of scored) {
    target -= item.score;
    if (target <= 0) return item.osis;
  }

  return scored[scored.length - 1]?.osis ?? null;
}

function pickNextOsis(current: string, crossRefs: CrossRefs, visitCounts: Record<string, number>): string {
  const neighbors = crossRefs[current] || [];
  if (neighbors.length === 0) {
    const keys = Object.keys(crossRefs);
    return keys[(Math.random() * keys.length) | 0] || START_OSIS;
  }

  const unvisited = neighbors.filter(([osis]) => (visitCounts[osis] || 0) === 0);

  if (TRAVERSAL_MODE === "novelty") {
    const picked = weightedPickWithScore(neighbors, ([osis, votes]) => {
      const seen = visitCounts[osis] || 0;
      const freshness = 1 / (1 + seen * 3);
      return Math.max(votes, 1) * freshness;
    });
    if (picked) return picked;
  }

  if (TRAVERSAL_MODE === "vote-biased") {
    const picked = weightedPickWithScore(neighbors, ([, votes]) => Math.pow(Math.max(votes, 1), 2));
    if (picked) return picked;
  }

  if (TRAVERSAL_MODE === "chapter-local") {
    const localNeighbors = neighbors.filter(([osis]) => isSameChapter(current, osis));
    const localPool = localNeighbors.length > 0 ? localNeighbors : neighbors;
    const picked = weightedPick(localPool);
    if (picked) return picked;
  }

  const candidatePool = unvisited.length > 0 && Math.random() < 0.75 ? unvisited : neighbors;
  const picked = weightedPick(candidatePool);
  if (picked) return picked;

  return candidatePool[(Math.random() * candidatePool.length) | 0]?.[0] || START_OSIS;
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await appendFile(filePath, `${line}\n`, "utf8");
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function resolveCrossRefsPath(): Promise<string> {
  for (const candidate of CROSSFREFS_PATH_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No crossrefs.json found. Run `npm run getdatafiles` first so dist/assets/crossrefs.json is available.",
  );
}

async function touchFile(index: FileIndex, filePath: string, mode: TouchMode): Promise<void> {
  const rel = relative(ROOT, filePath) || filePath;
  const current = index.files[rel];
  const touchedAt = nowIso();

  index.files[rel] = {
    mode: current?.mode === "edit" || mode === "edit" ? "edit" : "read",
    touchedAt,
    touchCount: (current?.touchCount || 0) + 1,
  };

  await appendLine(
    FILE_EVENTS_PATH,
    JSON.stringify({
      ts: touchedAt,
      mode,
      file: rel,
    }),
  );
}

function pickRandomUnique<T>(items: T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];

  const copy = [...items];
  const picked: T[] = [];
  const limit = Math.min(count, copy.length);

  while (picked.length < limit) {
    const idx = (Math.random() * copy.length) | 0;
    const [item] = copy.splice(idx, 1);
    if (item !== undefined) picked.push(item);
  }

  return picked;
}

async function listWalkNoteFiles(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) return [];

  const entries = await readdir(dirPath, { withFileTypes: true });
  const all = await Promise.all(
    entries.map(async entry => {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return listWalkNoteFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    }),
  );

  return all.flat();
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return markdown;
  return markdown.slice(end + 5);
}

function excerptNote(markdown: string, maxChars: number): string {
  const withoutFrontmatter = stripFrontmatter(markdown);
  const compact = withoutFrontmatter.replace(/\s+/gu, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(maxChars - 1, 1)).trimEnd()}...`;
}

async function buildHistoryContext(index: FileIndex): Promise<{ recent: string[]; random: string[] }> {
  const files = (await listWalkNoteFiles(WALKS_DIR)).sort();
  if (files.length === 0) {
    return { recent: [], random: [] };
  }

  const recentFiles = files.slice(-Math.max(HISTORY_RECENT_NOTES, 0));
  const oldFiles = files.slice(0, Math.max(files.length - recentFiles.length, 0));
  const randomFiles = pickRandomUnique(oldFiles, Math.max(HISTORY_RANDOM_NOTES, 0));

  const recent = await Promise.all(
    recentFiles.map(async filePath => {
      await touchFile(index, filePath, "read");
      const content = await readFile(filePath, "utf8");
      return `${relative(ROOT, filePath)} :: ${excerptNote(content, NOTE_EXCERPT_CHARS)}`;
    }),
  );

  const random = await Promise.all(
    randomFiles.map(async filePath => {
      await touchFile(index, filePath, "read");
      const content = await readFile(filePath, "utf8");
      return `${relative(ROOT, filePath)} :: ${excerptNote(content, NOTE_EXCERPT_CHARS)}`;
    }),
  );

  return { recent, random };
}

function buildPrompt(input: {
  step: number;
  currentOsis: string;
  currentText: string;
  nextOsis: string;
  nextText: string;
  refs: Array<[string, number]>;
  recentPath: string[];
  historyRecent: string[];
  historyRandom: string[];
}): string {
  const refsBlock = input.refs
    .slice(0, 8)
    .map(([osis, votes], idx) => `${idx + 1}. ${toHumanRef(osis)} (${osis}) votes=${votes}`)
    .join("\n");

  const recentPathBlock = input.recentPath
    .map((osis, idx) => `${idx + 1}. ${toHumanRef(osis)} (${osis})`)
    .join("\n");
  const recentNotesBlock =
    input.historyRecent.length > 0
      ? input.historyRecent.map((note, idx) => `${idx + 1}. ${note}`).join("\n")
      : "- [none]";
  const randomNotesBlock =
    input.historyRandom.length > 0
      ? input.historyRandom.map((note, idx) => `${idx + 1}. ${note}`).join("\n")
      : "- [none]";

  return [
    "You are walking the Bible by TSK roads and writing field notes.",
    "Output strict markdown only.",
    "Keep it concise and useful.",
    "",
    `Step: ${input.step}`,
    `Current: ${toHumanRef(input.currentOsis)} (${input.currentOsis})`,
    `Current text: ${input.currentText || "[missing verse text]"}`,
    `Suggested next: ${toHumanRef(input.nextOsis)} (${input.nextOsis})`,
    `Suggested next text: ${input.nextText || "[missing verse text]"}`,
    "",
    "Top outgoing TSK roads:",
    refsBlock || "- [none]",
    "",
    "Recent path:",
    recentPathBlock || "- [none]",
    "",
    "Lookback notes (most recent):",
    recentNotesBlock,
    "",
    "Lookback notes (random older):",
    randomNotesBlock,
    "",
    "Write these sections:",
    "# TSK Walk Step",
    "## Verse",
    "## Road Notes",
    "## Prayer",
    "## Next Move",
    "",
    "In Next Move, end with one line: NEXT_OSIS: <osis>",
  ].join("\n");
}

async function generateWithOllama(prompt: string): Promise<string> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      prompt,
      options: {
        temperature: 0.85,
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama request failed ${response.status} ${response.statusText}: ${body}`);
  }

  const data = JSON.parse(body) as { response?: string };
  if (!data.response) {
    throw new Error("Ollama response missing `response` field");
  }
  return data.response;
}

function extractNextOsis(markdown: string): string | null {
  const match = markdown.match(/NEXT_OSIS:\s*([A-Za-z0-9]+\.[0-9]+\.[0-9]+)/u);
  return match?.[1] ?? null;
}

function makeStepFilePath(step: number, osis: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const stepPrefix = String(step).padStart(6, "0");
  const safeOsis = sanitizeForFile(osis);
  return join(WALKS_DIR, datePrefix, `${stepPrefix}-${safeOsis}.md`);
}

async function ensureBaseDirs(): Promise<void> {
  await mkdir(AI_DIR, { recursive: true });
  await mkdir(WALKS_DIR, { recursive: true });
}

async function loadState(crossRefs: CrossRefs): Promise<WalkerState> {
  if (existsSync(STATE_PATH)) {
    return readJson<WalkerState>(STATE_PATH);
  }

  const fallbackStart = crossRefs[START_OSIS] ? START_OSIS : Object.keys(crossRefs)[0] || START_OSIS;
  return {
    currentOsis: fallbackStart,
    step: 0,
    visitCounts: {},
    recentPath: [],
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
}

async function loadFileIndex(): Promise<FileIndex> {
  if (existsSync(FILE_INDEX_PATH)) {
    return readJson<FileIndex>(FILE_INDEX_PATH);
  }
  return { files: {} };
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  await ensureBaseDirs();

  const crossrefsPath = await resolveCrossRefsPath();
  const crossRefs = await readJson<CrossRefs>(crossrefsPath);
  const [kjv, state, fileIndex] = await Promise.all([
    readJson<BibleData>(KJV_PATH),
    loadState(crossRefs),
    loadFileIndex(),
  ]);

  await touchFile(fileIndex, crossrefsPath, "read");
  await touchFile(fileIndex, KJV_PATH, "read");
  await touchFile(fileIndex, join(ROOT, "scripts", "ai", "wander.ts"), "read");
  await touchFile(fileIndex, STATE_PATH, "edit");
  await touchFile(fileIndex, FILE_INDEX_PATH, "edit");
  await touchFile(fileIndex, FILE_EVENTS_PATH, "edit");
  await touchFile(fileIndex, RUN_LOG_PATH, "edit");

  await appendLine(
    RUN_LOG_PATH,
    `${nowIso()} start model=${MODEL} mode=${TRAVERSAL_MODE} current=${state.currentOsis} maxSteps=${MAX_STEPS || "infinite"} historyRecent=${HISTORY_RECENT_NOTES} historyRandom=${HISTORY_RANDOM_NOTES}`,
  );

  let iteration = 0;
  while (MAX_STEPS <= 0 || iteration < MAX_STEPS) {
    const currentOsis = state.currentOsis;
    const currentText = getVerseText(kjv, currentOsis);
    const outgoing = (crossRefs[currentOsis] || []).sort((a, b) => b[1] - a[1]);

    const fallbackNext = pickNextOsis(currentOsis, crossRefs, state.visitCounts);
    const nextText = getVerseText(kjv, fallbackNext);
    const history = await buildHistoryContext(fileIndex);

    const prompt = buildPrompt({
      step: state.step + 1,
      currentOsis,
      currentText,
      nextOsis: fallbackNext,
      nextText,
      refs: outgoing,
      recentPath: state.recentPath,
      historyRecent: history.recent,
      historyRandom: history.random,
    });

    let markdown: string;
    try {
      markdown = await generateWithOllama(prompt);
    } catch (error) {
      await appendLine(RUN_LOG_PATH, `${nowIso()} ollama_error current=${currentOsis} err=${String(error)}`);
      await sleep(Math.max(STEP_DELAY_MS, 5000));
      continue;
    }

    const aiSuggestedNext = extractNextOsis(markdown);
    const nextOsis = aiSuggestedNext && crossRefs[aiSuggestedNext] ? aiSuggestedNext : fallbackNext;

    state.step += 1;
    state.visitCounts[currentOsis] = (state.visitCounts[currentOsis] || 0) + 1;
    state.recentPath = [...state.recentPath, currentOsis].slice(-MAX_RECENT);
    state.currentOsis = nextOsis;
    state.updatedAt = nowIso();

    const stepPath = makeStepFilePath(state.step, currentOsis);
    await mkdir(dirname(stepPath), { recursive: true });

    const frontmatter = [
      "---",
      `step: ${state.step}`,
      `timestamp: ${state.updatedAt}`,
      `model: ${MODEL}`,
      `current_osis: ${currentOsis}`,
      `next_osis: ${nextOsis}`,
      `source_crossrefs: ${relative(ROOT, crossrefsPath)}`,
      "---",
      "",
    ].join("\n");

    await writeFile(stepPath, `${frontmatter}${markdown.trim()}\n`, "utf8");

    await touchFile(fileIndex, stepPath, "edit");
    await touchFile(fileIndex, STATE_PATH, "edit");
    await touchFile(fileIndex, FILE_INDEX_PATH, "edit");

    await writeJson(STATE_PATH, state);
    await writeJson(FILE_INDEX_PATH, fileIndex);

    await appendLine(
      RUN_LOG_PATH,
      `${nowIso()} step=${state.step} current=${currentOsis} next=${nextOsis} file=${relative(ROOT, stepPath)}`,
    );

    console.log(`[wander-tsk] step=${state.step} ${currentOsis} -> ${nextOsis}`);

    iteration += 1;
    await sleep(STEP_DELAY_MS);
  }

  await appendLine(RUN_LOG_PATH, `${nowIso()} stopped steps=${iteration}`);
}

main().catch(async error => {
  await ensureBaseDirs();
  await appendLine(RUN_LOG_PATH, `${nowIso()} fatal_error ${String(error)}`);
  console.error("[wander-tsk] fatal error", error);
  process.exitCode = 1;
});
