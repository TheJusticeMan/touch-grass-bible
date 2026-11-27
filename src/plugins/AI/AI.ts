import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  MenuVan,
  View,
  stateMapping,
  van,
} from "@touchgrass/framework";
import { BrainCircuit } from "lucide";
import Plugin from "../../core/Plugin";
import { VerseRef } from "../../models/VerseRef";
import KnowledgeBasePlugin from "../KnowledgeBase";
import TSK from "../TSK";
import { AICategoryID, AIEmbeddingSearchCategoryID, SettingsCategoryID } from "../categoryIDs";
import { RequestHandler } from "./AIChat";
import { AIEmbeddingSearchCategory } from "./AIEmbeddingSearch";
import { AIEmbeddingSearchDB } from "./AIEmbeddingSearchDB";

const { div, button, textarea, h3, ul, li, p, input, label } = van.tags;

const AIStudyViewID = "ai-study-assistant";

const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

type StudyBuildResult = {
  question: string;
  primaryVerses: VerseRef[];
  crossReferences: VerseRef[];
  knowledgeBaseTopicId: number | null;
  knowledgeBaseTopicTitle: string | null;
  usedLLMSifting: boolean;
};

type VerseScoreMatch = {
  verse: VerseRef;
  score: number;
};

type SiftVersesWithLLMToolArgs = {
  question: string;
  candidates: Array<{
    osis: string;
    ref: string;
    score: number;
    text: string;
  }>;
  maxVerses?: number;
};

type SiftVersesWithLLMToolResult = {
  primaryVerses: string[];
};

interface AIPluginSettings {
  aiApiKey: string;
  aiEndpoint: string;
  aiModel: string;
  aiTrustedTools: string[];
}

const defaultAISettings: AIPluginSettings = {
  aiApiKey: "",
  aiEndpoint: "https://api.openai.com/v1/chat/completions",
  aiModel: "gpt-4.1-nano",
  aiTrustedTools: [],
};

function validateChatEndpoint(value: string): string {
  const endpoint = value.trim();
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(
      "Enter a complete chat-completions URL, such as https://api.openai.com/v1/chat/completions.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The chat endpoint must use HTTP or HTTPS.");
  }
  return endpoint;
}

export default class AIPlugin extends Plugin {
  settings: AIPluginSettings = { ...defaultAISettings };
  chat = new RequestHandler(this.app.toolsAPI, {
    authorizeToolCall: (tool, args) =>
      this.authorizeToolCall(this.app.toolsAPI.getToolIdentifier(tool), args),
  });
  private embeddingSearchDB: AIEmbeddingSearchDB = new AIEmbeddingSearchDB();

  async onload() {
    const saved = await this.loadSettings(defaultAISettings);
    this.settings = {
      aiApiKey: typeof saved.aiApiKey === "string" ? saved.aiApiKey : "",
      aiEndpoint:
        typeof saved.aiEndpoint === "string"
          ? this.safeChatEndpoint(saved.aiEndpoint)
          : defaultAISettings.aiEndpoint,
      aiModel:
        typeof saved.aiModel === "string" && saved.aiModel.trim()
          ? saved.aiModel.trim()
          : defaultAISettings.aiModel,
      aiTrustedTools: Array.isArray(saved.aiTrustedTools)
        ? Array.from(new Set(saved.aiTrustedTools.filter((name): name is string => typeof name === "string")))
        : [],
    };
    this.chat.endpoint = this.settings.aiEndpoint;
    this.registerPalette(AICategoryID, ({ state }) => new AICommandPalette(state, this));
    this.registerView(AIStudyViewID, () => new AIStudyView(this));
    this.registerSiftVersesWithLLMTool();
    this.registerPalette(
      AIEmbeddingSearchCategoryID,
      ({ state }) => new AIEmbeddingSearchCategory(state, this, this.embeddingSearchDB),
    );

    this.addVerseAction({
      id: "ai-ask",
      name: "Ask AI about this verse",
      icon: BrainCircuit,
      onTrigger: verseInfo => {
        if (!this.settings.aiApiKey) {
          new MenuVan([
            {
              title: "AI API key not set",
              icon: BrainCircuit,
              onClick: () => this.app.commandPalette.open({ topCategory: SettingsCategoryID }),
            },
          ]).showAtMouseEvent(verseInfo.event);
          return;
        }
        const verse = verseInfo.verse;
        const verseText = verse.vTXT;
        const prompt = `Explain the following Bible verse in context: "${verse.toString()} - ${verseText}"`;
        this.chat.apiKey = this.settings.aiApiKey;

        const text = van.state("Asking AI...");

        const responseEl = div({ class: "ai-response" }, text);
        van.add(verseInfo.element, responseEl);
        this.chat
          .request(
            {
              model: this.settings.aiModel,
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1000,
              stream: true,
            },
            delta => {
              if (delta.content) {
                if (text.val === "Asking AI...") text.val = "";
                text.val += delta.content;
              }
              return true;
            },
          )
          .catch((err: unknown) => (text.val = `Error: ${err instanceof Error ? err.message : String(err)}`));
      },
    });
  }

  openStudyView(): void {
    this.app.workspace.layout.findOrCreateViewById(AIStudyViewID);
  }

  isKnowledgeBaseAvailable(): boolean {
    return !!this.getKnowledgeBasePlugin();
  }

  isCrossReferenceAvailable(): boolean {
    return !!this.getTSKPlugin();
  }

  async buildStudyEntry(
    question: string,
    options: { useLLMSifting?: boolean } = {},
  ): Promise<StudyBuildResult> {
    const normalizedQuestion = question.replace(/\s+/g, " ").trim();
    const scoredMatches = this.findRelevantVersesWithScores(normalizedQuestion);
    let primaryVerses = scoredMatches.slice(0, 8).map(match => match.verse);
    let usedLLMSifting = false;

    if (options.useLLMSifting && primaryVerses.length > 0) {
      const siftedVerses = await this.siftVersesWithLLM(normalizedQuestion, scoredMatches, 8);
      if (siftedVerses.length > 0) {
        primaryVerses = siftedVerses;
        usedLLMSifting = true;
      }
    }

    const crossReferences = this.findCrossReferences(primaryVerses, 16);
    const topicTitle = this.studyTitleForQuestion(normalizedQuestion);
    const content = this.buildKnowledgeBaseContent(normalizedQuestion, primaryVerses, crossReferences);
    const combinedVerses = [...primaryVerses, ...crossReferences];

    let knowledgeBaseTopicId: number | null = null;
    let knowledgeBaseTopicTitle: string | null = null;

    const knowledgeBase = this.getKnowledgeBasePlugin();
    if (knowledgeBase) {
      const topic = knowledgeBase.createTopic(topicTitle, content, combinedVerses);
      knowledgeBaseTopicId = topic.id;
      knowledgeBaseTopicTitle = topic.title.val;
    }

    return {
      question: normalizedQuestion,
      primaryVerses,
      crossReferences,
      knowledgeBaseTopicId,
      knowledgeBaseTopicTitle,
      usedLLMSifting,
    };
  }

  openKnowledgeBaseTopic(topicId: number): void {
    const knowledgeBase = this.getKnowledgeBasePlugin();
    if (!knowledgeBase) return;
    knowledgeBase.openView({ topic: topicId });
  }

  private getTSKPlugin(): TSK | null {
    const plugin = this.app.plugins.plugins.get("tsk");
    if (!plugin) return null;
    if (plugin instanceof TSK) return plugin;

    const maybeTSK = plugin as unknown as Partial<TSK>;
    return typeof maybeTSK.crossRefsForVerse === "function" ? (plugin as TSK) : null;
  }

  private getKnowledgeBasePlugin(): KnowledgeBasePlugin | null {
    const plugin = this.app.plugins.plugins.get("knowledge-base");
    if (!plugin) return null;
    if (plugin instanceof KnowledgeBasePlugin) return plugin;

    const maybeKnowledgeBase = plugin as unknown as Partial<KnowledgeBasePlugin>;
    return typeof maybeKnowledgeBase.createTopic === "function" ? (plugin as KnowledgeBasePlugin) : null;
  }

  private studyTitleForQuestion(question: string): string {
    const compact = question.trim();
    const shortened = compact.length > 72 ? `${compact.slice(0, 69)}...` : compact;
    return `Study: ${shortened}`;
  }

  private extractKeywords(question: string): string[] {
    return Array.from(
      new Set(
        question
          .toLowerCase()
          .match(/[a-z0-9']+/g)
          ?.filter(word => word.length > 2 && !QUESTION_STOP_WORDS.has(word)) || [],
      ),
    ).slice(0, 10);
  }

  private findRelevantVersesWithScores(question: string): VerseScoreMatch[] {
    const normalizedQuestion = question.toLowerCase();
    const keywords = this.extractKeywords(question);
    const results: VerseScoreMatch[] = [];
    const bible = VerseRef.bible;

    for (const book of VerseRef.booksOfTheBible) {
      const chapters = bible[book];
      if (!chapters) continue;

      for (let chapter = 1; chapter < chapters.length; chapter++) {
        const verses = chapters[chapter];
        if (!verses) continue;

        for (let verse = 1; verse < verses.length; verse++) {
          const text = verses[verse];
          if (!text) continue;

          const lowerText = text.toLowerCase();
          let score = 0;

          if (normalizedQuestion.length > 7 && lowerText.includes(normalizedQuestion)) {
            score += 10;
          }

          for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
              score += keyword.length >= 6 ? 2 : 1;
            }
          }

          if (score > 0) {
            results.push({ verse: new VerseRef(book, chapter, verse), score });
          }
        }
      }
    }

    if (results.length === 0) {
      const currentVerse = this.app.verseState.val;
      return currentVerse ? [{ verse: currentVerse, score: 1 }] : [];
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 120);
  }

  private registerSiftVersesWithLLMTool(): void {
    this.addAPIcommand<SiftVersesWithLLMToolArgs, SiftVersesWithLLMToolResult>({
      definition: {
        function: {
          name: "sift_verses_with_llm",
          description:
            "Rerank candidate Bible verses for a study question using the language model and return the strongest matches.",
          parameters: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The study question or passage prompt to use when reranking verses.",
              },
              candidates: {
                type: "array",
                description: "Candidate verses sorted by relevance before reranking.",
                items: {
                  type: "object",
                  properties: {
                    osis: {
                      type: "string",
                      description: "OSIS reference for the candidate verse, such as John.3.16.",
                    },
                    ref: {
                      type: "string",
                      description: "Readable verse reference, such as John 3:16.",
                    },
                    score: {
                      type: "number",
                      description: "The previous relevance score assigned to the verse.",
                    },
                    text: {
                      type: "string",
                      description: "The verse text to consider while reranking.",
                    },
                  },
                  required: ["osis", "ref", "score", "text"],
                  additionalProperties: false,
                },
              },
              maxVerses: {
                type: "integer",
                description: "Maximum number of verses to return after reranking.",
                default: 8,
              },
            },
            required: ["question", "candidates"],
            additionalProperties: false,
          },
        },
      },
      execute: async ({ question, candidates, maxVerses = 8 }) => {
        if (!question || !Array.isArray(candidates)) {
          return { primaryVerses: [] };
        }

        const limit = Number.isFinite(maxVerses) ? Math.max(1, Math.floor(maxVerses)) : 8;
        const validCandidates = candidates.filter(candidate => {
          const osis = candidate.osis.trim();
          return /^[1-3]?[A-Za-z]+\.[0-9]+\.[0-9]+$/i.test(osis);
        });

        if (validCandidates.length === 0) {
          return { primaryVerses: [] };
        }

        const scoredMatches = validCandidates
          .map(candidate => {
            const osis = candidate.osis.trim();
            const score = Number(candidate.score);
            if (!Number.isFinite(score)) return null;
            return { verse: VerseRef.fromOSIS(osis), score };
          })
          .filter((match): match is VerseScoreMatch => match !== null);

        const selected = await this.siftVersesWithLLM(question, scoredMatches, limit);
        return { primaryVerses: selected.map(verse => verse.toOSIS()) };
      },
    });
  }

  private async siftVersesWithLLM(
    question: string,
    scoredMatches: VerseScoreMatch[],
    maxVerses: number,
  ): Promise<VerseRef[]> {
    if (!this.settings.aiApiKey) return [];

    const candidates = scoredMatches.slice(0, 60).map(match => ({
      osis: match.verse.toOSIS(),
      ref: match.verse.toString(),
      text: match.verse.vTXT,
      score: match.score,
    }));
    if (candidates.length === 0) return [];

    this.chat.apiKey = this.settings.aiApiKey;

    const prompt = [
      "Select the strongest Bible verses for this study question.",
      `Question: ${question}`,
      "",
      `Choose up to ${maxVerses} verses from the candidates.`,
      "Return JSON only in this exact shape:",
      '{"primaryVerses": ["Book.Chapter.Verse", "..."]}',
      "No markdown, no explanation.",
      "",
      "Candidates:",
      ...candidates.map(
        candidate =>
          `- ${candidate.osis} | ${candidate.ref} | score=${candidate.score} | text=${candidate.text}`,
      ),
    ].join("\n");

    const response = await this.chat.sendChatRequest({
      model: this.settings.aiModel,
      messages: [
        {
          role: "system",
          content:
            "You are a Bible retrieval reranker. Return strict JSON only. Do not invent verses not present in candidates.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 500,
      stream: false,
    });

    const content = response.content || "";
    const selected = this.parseSelectedOSIS(content);
    if (selected.length === 0) return [];

    const matchByOSIS = new Map(scoredMatches.map(match => [match.verse.toOSIS(), match.verse]));
    const verses: VerseRef[] = [];
    const seen = new Set<string>();

    for (const osis of selected) {
      const verse = matchByOSIS.get(osis);
      if (!verse || seen.has(osis)) continue;
      seen.add(osis);
      verses.push(verse);
      if (verses.length >= maxVerses) break;
    }

    return verses;
  }

  private parseSelectedOSIS(raw: string): string[] {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    const jsonLike = jsonMatch ? jsonMatch[0] : trimmed;

    try {
      const parsed = JSON.parse(jsonLike) as { primaryVerses?: unknown };
      if (!Array.isArray(parsed.primaryVerses)) return [];

      return parsed.primaryVerses
        .filter((osis): osis is string => typeof osis === "string")
        .map(osis => osis.trim())
        .filter(osis => /^[1-3]?[A-Za-z]+\.[0-9]+\.[0-9]+$/i.test(osis));
    } catch {
      return [];
    }
  }

  private findCrossReferences(seedVerses: VerseRef[], limit: number): VerseRef[] {
    const tskPlugin = this.getTSKPlugin();
    if (!tskPlugin || seedVerses.length === 0) return [];

    const primary = new Set(seedVerses.map(verse => verse.toOSIS()));
    const seen = new Set<string>();
    const output: VerseRef[] = [];

    for (const verse of seedVerses) {
      const refs = tskPlugin.crossRefsForVerse(verse);
      for (const ref of refs) {
        const osis = ref.toOSIS();
        if (primary.has(osis) || seen.has(osis)) continue;
        seen.add(osis);
        output.push(ref);
        if (output.length >= limit) return output;
      }
    }

    return output;
  }

  private buildKnowledgeBaseContent(
    question: string,
    primaryVerses: VerseRef[],
    crossReferences: VerseRef[],
  ): string {
    const translation = this.app.translationState.val;
    const formatList = (verses: VerseRef[]) => {
      if (verses.length === 0) return "- (No verses found yet)";
      return verses
        .map(verse => `- ${verse.toString()} - ${verse.text(translation) || verse.vTXT}`)
        .join("\n");
    };

    return [
      `Question: ${question}`,
      "",
      "Use the verses below to reason through the answer yourself.",
      "",
      "Primary verses:",
      formatList(primaryVerses),
      "",
      "Cross references:",
      formatList(crossReferences),
      "",
      "Study prompts:",
      "- What repeated themes appear across these verses?",
      "- What does each verse reveal about God's character and intent?",
      "- How do the cross references clarify or challenge your first interpretation?",
      "- Write your own conclusion in your words after comparing all passages.",
    ].join("\n");
  }

  async saveSettings() {
    this.chat.endpoint = this.settings.aiEndpoint;
    await super.saveSettings(this.settings);
  }

  async setChatEndpoint(value: string): Promise<void> {
    this.settings.aiEndpoint = validateChatEndpoint(value);
    this.chat.endpoint = this.settings.aiEndpoint;
    await this.saveSettings();
  }

  async setModel(value: string): Promise<void> {
    const model = value.trim();
    if (!model) throw new Error("The model name cannot be empty.");
    this.settings.aiModel = model;
    await this.saveSettings();
  }

  async setTrustedTools(value: string): Promise<void> {
    const names = Array.from(
      new Set(
        value
          .split(",")
          .map(name => name.trim())
          .filter(Boolean),
      ),
    );
    const available = new Set(
      this.app.toolsAPI.getTools().map(tool => this.app.toolsAPI.getToolIdentifier(tool)),
    );
    const unknown = names.filter(name => !available.has(name));
    if (unknown.length > 0) {
      throw new Error(`Unknown tool(s): ${unknown.join(", ")}.`);
    }
    this.settings.aiTrustedTools = names;
    await this.saveSettings();
  }

  private safeChatEndpoint(value: string): string {
    try {
      return validateChatEndpoint(value);
    } catch {
      return defaultAISettings.aiEndpoint;
    }
  }

  private async authorizeToolCall(name: string, args: Record<string, unknown>): Promise<boolean> {
    if (this.settings.aiTrustedTools.includes(name)) return true;

    const serialized = JSON.stringify(args);
    const preview = serialized.length > 500 ? `${serialized.slice(0, 497)}...` : serialized;
    return this.app.commandPalette.confirm(
      `Allow the AI to run "${name}" once?\nArguments: ${preview}\n\nUse “Manage trusted AI tools” to skip future confirmations for a tool.`,
    );
  }
}

class AICommandPalette extends CommandCategory<string> {
  allItems = van.state<string[]>([]);
  criteria: Array<(item: string) => string> = [item => item];
  private responses = van.state<{ question: string; answer: string }[]>([]);
  private inFlightResponse = van.state<{ question: string; answer: string; error?: string } | null>(null);

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: AIPlugin,
  ) {
    super(state, "AI Bible Assistant", "Ask the AI assistant questions about Bible verses and theology.");
    this.extras = van.derive(() => {
      const items: CommandItem[] = [];

      items.push({
        title: this.plugin.settings.aiApiKey ? "Update AI API key" : "Set AI API key",
        description: this.plugin.settings.aiApiKey
          ? "Replace the saved API key."
          : "Enter an API key to enable AI requests.",
        click: () =>
          this.promptSetting("Enter your OpenAI-compatible API key:", async value => {
            this.plugin.settings.aiApiKey = value.trim();
            await this.plugin.saveSettings();
          }),
      });

      items.push({
        title: "Set AI chat endpoint",
        description: `Current: ${this.plugin.settings.aiEndpoint}`,
        click: () =>
          this.promptSetting("Enter the full chat-completions URL (HTTP or HTTPS):", value =>
            this.plugin.setChatEndpoint(value),
          ),
      });

      items.push({
        title: "Set AI model",
        description: `Current model: ${this.plugin.settings.aiModel}`,
        click: () => this.promptSetting("Enter the chat model name:", value => this.plugin.setModel(value)),
      });

      const availableTools = this.plugin.app.toolsAPI
        .getTools()
        .map(tool => this.plugin.app.toolsAPI.getToolIdentifier(tool));
      items.push({
        title: "Manage trusted AI tools",
        description: `Preapprove without per-call prompts: ${this.plugin.settings.aiTrustedTools.join(", ") || "none"}`,
        click: () =>
          this.promptSetting(
            `Currently trusted: ${this.plugin.settings.aiTrustedTools.join(", ") || "none"}. Enter comma-separated tool names to preapprove. Available tools: ${availableTools.join(", ") || "none"}. Leave blank to clear.`,
            value => this.plugin.setTrustedTools(value),
          ),
      });

      items.push({
        title: "Open semantic embedding search",
        description: "Search semantically similar verses using precomputed embeddings + Orama",
        click: () => (this.updateViewState({ topCategory: AIEmbeddingSearchCategoryID }), false),
      });

      items.push({
        title: "Open AI study builder view",
        description: "Ask a question, gather verses + cross references, and create a Knowledge Base entry.",
        click: () => {
          this.plugin.openStudyView();
          return true;
        },
      });

      if (this.inFlightResponse.val) {
        const { question, answer, error } = this.inFlightResponse.val;
        items.push({
          title: error ? "AI error" : "AI: thinking...",
          description: error ? error : answer || `Working on: ${question}`,
        });
      }

      if (this.responses.val.length > 0) {
        const latest = this.responses.val[this.responses.val.length - 1];
        items.push({
          title: "Latest AI response",
          description: latest.answer || `No content returned for: ${latest.question}`,
        });
      }

      return items;
    });

    this.allItems = van.derive(() => {
      const query = this.state.query.val.trim();
      return query ? [query] : [];
    });
  }

  renderItem(command: string): CommandItem {
    return {
      title: `Ask: ${command}`,
      description: "Send this question to the AI assistant",
      click: () => {
        const apiKey = this.plugin.settings.aiApiKey;
        if (!apiKey) {
          this.updateViewState({ topCategory: SettingsCategoryID });
          return false;
        }
        this.plugin.chat.apiKey = apiKey;
        const verse = this.plugin.app.verseState.val;
        const contextPrompt = verse
          ? `[Current verse: ${verse.toString()} - "${verse.vTXT}"]\n\n${command}`
          : command;

        this.inFlightResponse.val = { question: command, answer: "" };

        this.plugin.chat
          .request(
            {
              model: this.plugin.settings.aiModel,
              messages: [{ role: "user", content: contextPrompt }],
              max_tokens: 1000,
              stream: true,
            },
            delta => {
              if (delta.content) {
                if (!this.inFlightResponse.val || this.inFlightResponse.val.question !== command) {
                  this.inFlightResponse.val = { question: command, answer: "" };
                }
                this.inFlightResponse.val.answer += delta.content;
              }
              return true;
            },
          )
          .then(() => {
            if (this.inFlightResponse.val && this.inFlightResponse.val.question === command) {
              this.responses.val = [
                ...this.responses.val,
                { question: command, answer: this.inFlightResponse.val.answer },
              ];
              this.inFlightResponse.val = null;
            }
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            if (!this.inFlightResponse.val || this.inFlightResponse.val.question !== command) {
              this.inFlightResponse.val = { question: command, answer: "", error: message };
            } else {
              this.inFlightResponse.val.error = message;
            }
          });
        return false;
      },
    };
  }

  private promptSetting(prompt: string, update: (value: string) => void | Promise<void>): false {
    void this.plugin.app.commandPalette.prompt(prompt).then(async value => {
      if (value === null) return;
      try {
        await update(value);
        this.inFlightResponse.val = null;
      } catch (error) {
        this.inFlightResponse.val = {
          question: "AI settings",
          answer: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      this.updateViewState({ topCategory: AICategoryID });
    });
    return false;
  }
}

class AIStudyView extends View {
  readonly viewTypeId = AIStudyViewID;
  private question = van.state("");
  private status = van.state("Type a question, then build a study entry.");
  private isRunning = van.state(false);
  private useLLMSifting = van.state(false);
  private result = van.state<StudyBuildResult | null>(null);

  constructor(private plugin: AIPlugin) {
    super("AI Study Builder", {});
  }

  create(): HTMLElement {
    return div(
      { class: "ai-study-view" },
      h3("AI Study Builder"),
      p(
        "Ask a Bible question. This view finds matching verses, adds cross references, and creates a Knowledge Base entry so you can work through the answer.",
      ),
      textarea({
        rows: 4,
        placeholder: "Example: What does the Bible teach about forgiveness and repentance?",
        value: () => this.question.val,
        oninput: event => (this.question.val = (event.target as HTMLTextAreaElement).value),
      }),
      label(
        { style: "display:flex; gap:8px; margin-top:8px; align-items:center;" },
        input({
          type: "checkbox",
          checked: () => this.useLLMSifting.val,
          oninput: event => (this.useLLMSifting.val = (event.target as HTMLInputElement).checked),
        }),
        "Use LLM to sift the best verses (optional)",
      ),
      div(
        { style: "display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;" },
        button(
          {
            disabled: () => this.isRunning.val,
            onclick: () => this.runStudyBuild(),
          },
          () => (this.isRunning.val ? "Building..." : "Build Study Entry"),
        ),
        button(
          {
            onclick: () => this.plugin.openStudyView(),
          },
          "Open/Focus Study View",
        ),
      ),
      p(() => this.status.val),
      () => {
        const result = this.result.val;
        if (!result) return null;

        return div(
          h3("Primary Verses"),
          ul(
            ...result.primaryVerses.map(verse =>
              li(
                {
                  onclick: () => (this.plugin.app.verseState.val = verse),
                  style: "cursor:pointer;",
                },
                `${verse.toString()} - ${verse.vTXT}`,
              ),
            ),
          ),
          h3("Cross References"),
          ul(
            ...result.crossReferences.map(verse =>
              li(
                {
                  onclick: () => (this.plugin.app.verseState.val = verse),
                  style: "cursor:pointer;",
                },
                `${verse.toString()} - ${verse.vTXT}`,
              ),
            ),
          ),
          result.knowledgeBaseTopicId !== null
            ? button(
                {
                  onclick: () => this.plugin.openKnowledgeBaseTopic(result.knowledgeBaseTopicId as number),
                },
                `Open Knowledge Base Entry: ${result.knowledgeBaseTopicTitle || "New Topic"}`,
              )
            : p("Knowledge Base plugin is not available, so no entry was saved."),
        );
      },
    );
  }

  private async runStudyBuild(): Promise<void> {
    const question = this.question.val.trim();
    if (!question) {
      this.status.val = "Enter a question first.";
      return;
    }

    this.isRunning.val = true;
    try {
      const result = await this.plugin.buildStudyEntry(question, {
        useLLMSifting: this.useLLMSifting.val,
      });
      this.result.val = result;

      if (result.knowledgeBaseTopicId !== null) {
        const siftingStatus = result.usedLLMSifting ? " with LLM sifting" : "";
        this.status.val = `Created Knowledge Base entry${siftingStatus} with ${result.primaryVerses.length + result.crossReferences.length} verses.`;
      } else {
        this.status.val =
          "Found verses and cross references, but Knowledge Base plugin is not available so nothing was saved.";
      }
    } catch (error) {
      this.status.val = `Failed to build study entry: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.isRunning.val = false;
    }
  }
}
