"use strict";

// scripts/wander-tsk.ts
var import_promises = require("node:fs/promises");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/models/booksOfTheBible.ts
var booksOfTheBible = [
  "GENESIS",
  "EXODUS",
  "LEVITICUS",
  "NUMBERS",
  "DEUTERONOMY",
  "JOSHUA",
  "JUDGES",
  "RUTH",
  "1 SAMUEL",
  "2 SAMUEL",
  "1 KINGS",
  "2 KINGS",
  "1 CHRONICLES",
  "2 CHRONICLES",
  "EZRA",
  "NEHEMIAH",
  "ESTHER",
  "JOB",
  "PSALMS",
  "PROVERBS",
  "ECCLESIASTES",
  "SONG SOLOMON",
  "ISAIAH",
  "JEREMIAH",
  "LAMENTATIONS",
  "EZEKIEL",
  "DANIEL",
  "HOSEA",
  "JOEL",
  "AMOS",
  "OBADIAH",
  "JONAH",
  "MICAH",
  "NAHUM",
  "HABAKKUK",
  "ZEPHANIAH",
  "HAGGAI",
  "ZECHARIAH",
  "MALACHI",
  "MATTHEW",
  "MARK",
  "LUKE",
  "JOHN",
  "ACTS",
  "ROMANS",
  "1 CORINTHIANS",
  "2 CORINTHIANS",
  "GALATIANS",
  "EPHESIANS",
  "PHILIPPIANS",
  "COLOSSIANS",
  "1 THESSALONIANS",
  "2 THESSALONIANS",
  "1 TIMOTHY",
  "2 TIMOTHY",
  "TITUS",
  "PHILEMON",
  "HEBREWS",
  "JAMES",
  "1 PETER",
  "2 PETER",
  "1 JOHN",
  "2 JOHN",
  "3 JOHN",
  "JUDE",
  "REVELATION",
];
var BookShortNames = [
  "Gen",
  "Exod",
  "Lev",
  "Num",
  "Deut",
  "Josh",
  "Judg",
  "Ruth",
  "1Sam",
  "2Sam",
  "1Kgs",
  "2Kgs",
  "1Chr",
  "2Chr",
  "Ezra",
  "Neh",
  "Esth",
  "Job",
  "Ps",
  "Prov",
  "Eccl",
  "Song",
  "Isa",
  "Jer",
  "Lam",
  "Ezek",
  "Dan",
  "Hos",
  "Joel",
  "Amos",
  "Obad",
  "Jonah",
  "Mic",
  "Nah",
  "Hab",
  "Zeph",
  "Hag",
  "Zech",
  "Mal",
  "Matt",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Rom",
  "1Cor",
  "2Cor",
  "Gal",
  "Eph",
  "Phil",
  "Col",
  "1Thess",
  "2Thess",
  "1Tim",
  "2Tim",
  "Titus",
  "Phlm",
  "Heb",
  "Jas",
  "1Pet",
  "2Pet",
  "1John",
  "2John",
  "3John",
  "Jude",
  "Rev",
];

// scripts/wander-tsk.ts
var ROOT = process.cwd();
var AI_DIR = (0, import_node_path.join)(ROOT, "ai");
var WALKS_DIR = (0, import_node_path.join)(AI_DIR, "walks");
var STATE_PATH = (0, import_node_path.join)(AI_DIR, "wander-state.json");
var FILE_INDEX_PATH = (0, import_node_path.join)(AI_DIR, "file-index.json");
var FILE_EVENTS_PATH = (0, import_node_path.join)(AI_DIR, "file-events.jsonl");
var RUN_LOG_PATH = (0, import_node_path.join)(AI_DIR, "wander.log");
var KJV_PATH = (0, import_node_path.join)(ROOT, "data", "translations", "KJV.json");
var CROSSFREFS_PATH_CANDIDATES = [
  (0, import_node_path.join)(ROOT, "dist", "crossrefs.json"),
  (0, import_node_path.join)(ROOT, "data", "crossrefs.json"),
];
var MODEL = process.env.OLLAMA_MODEL || "gemma4:12b-it-qat";
var OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
var START_OSIS = process.env.START_OSIS || "John.3.16";
var STEP_DELAY_MS = Number.parseInt(process.env.STEP_DELAY_MS || "2500", 10);
var MAX_STEPS = Number.parseInt(process.env.MAX_STEPS || "0", 10);
var MAX_RECENT = 12;
var HISTORY_RECENT_NOTES = Number.parseInt(process.env.HISTORY_RECENT_NOTES || "5", 10);
var HISTORY_RANDOM_NOTES = Number.parseInt(process.env.HISTORY_RANDOM_NOTES || "3", 10);
var NOTE_EXCERPT_CHARS = Number.parseInt(process.env.NOTE_EXCERPT_CHARS || "700", 10);
var TRAVERSAL_MODE = (process.env.TRAVERSAL_MODE || "balanced").toLowerCase();
var validModes = ["balanced", "novelty", "vote-biased", "chapter-local"];
if (!validModes.includes(TRAVERSAL_MODE)) {
  throw new Error(`Invalid TRAVERSAL_MODE=${TRAVERSAL_MODE}. Expected one of: ${validModes.join(", ")}`);
}
function nowIso() {
  return /* @__PURE__ */ new Date().toISOString();
}
function normalizeVerseText(value) {
  return value.replace(/^#\s*/u, "").replace(/\s+/gu, " ").trim();
}
function titleCaseBook(book) {
  return book
    .toLowerCase()
    .split(" ")
    .map(part => (part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}
function parseOSIS(osisRaw) {
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
function isSameChapter(a, b) {
  const pa = parseOSIS(a);
  const pb = parseOSIS(b);
  if (!pa || !pb) return false;
  return pa.book === pb.book && pa.chapter === pb.chapter;
}
function getVerseText(kjv, osis) {
  const parsed = parseOSIS(osis);
  if (!parsed) return "";
  const chapterData = kjv[parsed.book]?.[parsed.chapter];
  if (!Array.isArray(chapterData)) return "";
  const verseText = chapterData[parsed.verse];
  return typeof verseText === "string" ? normalizeVerseText(verseText) : "";
}
function toHumanRef(osis) {
  const parsed = parseOSIS(osis);
  if (!parsed) return osis;
  return `${titleCaseBook(parsed.book)} ${parsed.chapter}:${parsed.verse}`;
}
function sanitizeForFile(value) {
  return value
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function weightedPick(edges) {
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
function weightedPickWithScore(edges, score) {
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
function pickNextOsis(current, crossRefs, visitCounts) {
  const neighbors = crossRefs[current] || [];
  if (neighbors.length === 0) {
    const keys = Object.keys(crossRefs);
    return keys[(Math.random() * keys.length) | 0] || START_OSIS;
  }
  const unvisited = neighbors.filter(([osis]) => (visitCounts[osis] || 0) === 0);
  if (TRAVERSAL_MODE === "novelty") {
    const picked2 = weightedPickWithScore(neighbors, ([osis, votes]) => {
      const seen = visitCounts[osis] || 0;
      const freshness = 1 / (1 + seen * 3);
      return Math.max(votes, 1) * freshness;
    });
    if (picked2) return picked2;
  }
  if (TRAVERSAL_MODE === "vote-biased") {
    const picked2 = weightedPickWithScore(neighbors, ([, votes]) => Math.pow(Math.max(votes, 1), 2));
    if (picked2) return picked2;
  }
  if (TRAVERSAL_MODE === "chapter-local") {
    const localNeighbors = neighbors.filter(([osis]) => isSameChapter(current, osis));
    const localPool = localNeighbors.length > 0 ? localNeighbors : neighbors;
    const picked2 = weightedPick(localPool);
    if (picked2) return picked2;
  }
  const candidatePool = unvisited.length > 0 && Math.random() < 0.75 ? unvisited : neighbors;
  const picked = weightedPick(candidatePool);
  if (picked) return picked;
  return candidatePool[(Math.random() * candidatePool.length) | 0]?.[0] || START_OSIS;
}
async function appendLine(path, line) {
  await (0, import_promises.appendFile)(
    path,
    `${line}
`,
    "utf8",
  );
}
async function readJson(path) {
  const content = await (0, import_promises.readFile)(path, "utf8");
  return JSON.parse(content);
}
async function writeJson(path, value) {
  await (0, import_promises.writeFile)(
    path,
    `${JSON.stringify(value, null, 2)}
`,
    "utf8",
  );
}
async function resolveCrossRefsPath() {
  for (const candidate of CROSSFREFS_PATH_CANDIDATES) {
    if ((0, import_node_fs.existsSync)(candidate)) return candidate;
  }
  throw new Error(
    "No crossrefs.json found. Run `npm run getdatafiles` first so dist/crossrefs.json is available.",
  );
}
async function touchFile(index, filePath, mode) {
  const rel = (0, import_node_path.relative)(ROOT, filePath) || filePath;
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
function pickRandomUnique(items, count) {
  if (count <= 0 || items.length === 0) return [];
  const copy = [...items];
  const picked = [];
  const limit = Math.min(count, copy.length);
  while (picked.length < limit) {
    const idx = (Math.random() * copy.length) | 0;
    const [item] = copy.splice(idx, 1);
    if (item !== void 0) picked.push(item);
  }
  return picked;
}
async function listWalkNoteFiles(dirPath) {
  if (!(0, import_node_fs.existsSync)(dirPath)) return [];
  const entries = await (0, import_promises.readdir)(dirPath, { withFileTypes: true });
  const all = await Promise.all(
    entries.map(async entry => {
      const fullPath = (0, import_node_path.join)(dirPath, entry.name);
      if (entry.isDirectory()) {
        return listWalkNoteFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    }),
  );
  return all.flat();
}
function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return markdown;
  return markdown.slice(end + 5);
}
function excerptNote(markdown, maxChars) {
  const withoutFrontmatter = stripFrontmatter(markdown);
  const compact = withoutFrontmatter.replace(/\s+/gu, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(maxChars - 1, 1)).trimEnd()}...`;
}
async function buildHistoryContext(index) {
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
      const content = await (0, import_promises.readFile)(filePath, "utf8");
      return `${(0, import_node_path.relative)(ROOT, filePath)} :: ${excerptNote(content, NOTE_EXCERPT_CHARS)}`;
    }),
  );
  const random = await Promise.all(
    randomFiles.map(async filePath => {
      await touchFile(index, filePath, "read");
      const content = await (0, import_promises.readFile)(filePath, "utf8");
      return `${(0, import_node_path.relative)(ROOT, filePath)} :: ${excerptNote(content, NOTE_EXCERPT_CHARS)}`;
    }),
  );
  return { recent, random };
}
function buildPrompt(input) {
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
async function generateWithOllama(prompt) {
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
  const data = JSON.parse(body);
  if (!data.response) {
    throw new Error("Ollama response missing `response` field");
  }
  return data.response;
}
function extractNextOsis(markdown) {
  const match = markdown.match(/NEXT_OSIS:\s*([A-Za-z0-9]+\.[0-9]+\.[0-9]+)/u);
  return match?.[1] ?? null;
}
function makeStepFilePath(step, osis) {
  const datePrefix = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
  const stepPrefix = String(step).padStart(6, "0");
  const safeOsis = sanitizeForFile(osis);
  return (0, import_node_path.join)(WALKS_DIR, datePrefix, `${stepPrefix}-${safeOsis}.md`);
}
async function ensureBaseDirs() {
  await (0, import_promises.mkdir)(AI_DIR, { recursive: true });
  await (0, import_promises.mkdir)(WALKS_DIR, { recursive: true });
}
async function loadState(crossRefs) {
  if ((0, import_node_fs.existsSync)(STATE_PATH)) {
    return readJson(STATE_PATH);
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
async function loadFileIndex() {
  if ((0, import_node_fs.existsSync)(FILE_INDEX_PATH)) {
    return readJson(FILE_INDEX_PATH);
  }
  return { files: {} };
}
async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}
async function main() {
  await ensureBaseDirs();
  const crossrefsPath = await resolveCrossRefsPath();
  const crossRefs = await readJson(crossrefsPath);
  const [kjv, state, fileIndex] = await Promise.all([
    readJson(KJV_PATH),
    loadState(crossRefs),
    loadFileIndex(),
  ]);
  await touchFile(fileIndex, crossrefsPath, "read");
  await touchFile(fileIndex, KJV_PATH, "read");
  await touchFile(fileIndex, (0, import_node_path.join)(ROOT, "scripts", "wander-tsk.ts"), "read");
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
    let markdown;
    try {
      markdown = await generateWithOllama(prompt);
    } catch (error) {
      await appendLine(RUN_LOG_PATH, `${nowIso()} ollama_error current=${currentOsis} err=${String(error)}`);
      await sleep(Math.max(STEP_DELAY_MS, 5e3));
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
    await (0, import_promises.mkdir)((0, import_node_path.dirname)(stepPath), { recursive: true });
    const frontmatter = [
      "---",
      `step: ${state.step}`,
      `timestamp: ${state.updatedAt}`,
      `model: ${MODEL}`,
      `current_osis: ${currentOsis}`,
      `next_osis: ${nextOsis}`,
      `source_crossrefs: ${(0, import_node_path.relative)(ROOT, crossrefsPath)}`,
      "---",
      "",
    ].join("\n");
    await (0, import_promises.writeFile)(
      stepPath,
      `${frontmatter}${markdown.trim()}
`,
      "utf8",
    );
    await touchFile(fileIndex, stepPath, "edit");
    await touchFile(fileIndex, STATE_PATH, "edit");
    await touchFile(fileIndex, FILE_INDEX_PATH, "edit");
    await writeJson(STATE_PATH, state);
    await writeJson(FILE_INDEX_PATH, fileIndex);
    await appendLine(
      RUN_LOG_PATH,
      `${nowIso()} step=${state.step} current=${currentOsis} next=${nextOsis} file=${(0, import_node_path.relative)(ROOT, stepPath)}`,
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
