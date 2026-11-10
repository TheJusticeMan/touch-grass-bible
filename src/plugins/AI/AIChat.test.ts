import { describe, expect, it, vi } from "vitest";
import type { PluginMetadata } from "@touchgrass/framework";
import { ToolsAPI } from "../../core/ToolsAPI";
import { VerseRef } from "../../models/VerseRef";
import type TouchGrassBibleApp from "../../main";
import { AIEmbeddingSearchCategoryID } from "../categoryIDs";
import AIPlugin from "./AI";
import { RequestHandler } from "./AIChat";

function makeAIApp() {
  return {
    files: {
      loadConfigObject: vi.fn().mockResolvedValue({}),
      saveConfigObject: vi.fn().mockResolvedValue(undefined),
    },
    commandPalette: {
      registerPalette: vi.fn(),
      unregisterPalette: vi.fn(),
    },
    addVerseAction: vi.fn(),
    removeVerseAction: vi.fn(),
    workspace: {
      layout: {
        findOrCreateViewById: vi.fn(),
        registerView: vi.fn(),
      },
    },
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    plugins: {
      plugins: new Map(),
    },
    toolsAPI: new ToolsAPI(),
    verseState: { val: new VerseRef("GENESIS", 1, 1) },
    translationState: { val: "KJV" },
  } as unknown as TouchGrassBibleApp;
}

const aiManifest: PluginMetadata = {
  id: "ai",
  name: "AI",
  description: "AI study plugin",
  version: "1.0",
};

describe("RequestHandler", () => {
  it("executes tool calls and submits their results in the next completion", async () => {
    const tools = new ToolsAPI();
    tools.registerTool({
      definition: {
        function: {
          name: "lookup_verse",
          parameters: { type: "object" },
        },
      },
      execute: ({ reference }) => ({ reference, text: "For God so loved the world" }),
    });

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "call_verse",
                      type: "function",
                      function: { name: "lookup_verse", arguments: '{"reference":"John 3:16"}' },
                    },
                  ],
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "John 3:16" } }] })),
      );
    const handler = new RequestHandler(tools, { apiKey: "test-key", fetch: fetcher });

    await expect(
      handler.request({ model: "gpt-test", messages: [{ role: "user", content: "Show John 3:16" }] }),
    ).resolves.toEqual({ role: "assistant", content: "John 3:16" });

    const secondRequest = JSON.parse(String(fetcher.mock.calls[1][1]?.body)) as { messages: unknown[] };
    expect(secondRequest.messages).toEqual([
      { role: "user", content: "Show John 3:16" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_verse",
            type: "function",
            function: { name: "lookup_verse", arguments: '{"reference":"John 3:16"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_verse",
        name: "lookup_verse",
        content: '{"result":{"reference":"John 3:16","text":"For God so loved the world"}}',
      },
    ]);
  });

  it("combines streamed text and function arguments", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Hello ","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup_verse","arguments":"{\\"reference\\":\\""}}]}}]}\n' +
              'data: {"choices":[{"delta":{"content":"world","tool_calls":[{"index":0,"function":{"arguments":"John 3:16\\"}"}}]}}]}\n' +
              "data: [DONE]\n",
          ),
        );
        controller.close();
      },
    });

    const response = await RequestHandler.handleStreamingResponse(new Response(body), () => true);

    expect(response).toEqual({
      role: "assistant",
      content: "Hello world",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "lookup_verse", arguments: '{"reference":"John 3:16"}' },
        },
      ],
    });
  });

  it("registers the AI verse-sifting tool", async () => {
    const app = makeAIApp();
    const plugin = new AIPlugin(app, aiManifest);
    const pluginAny = plugin as unknown as {
      embeddingSearchDB: { initialize: ReturnType<typeof vi.fn> };
    };
    pluginAny.embeddingSearchDB = { initialize: vi.fn().mockResolvedValue(undefined) };
    const pluginMethods = plugin as unknown as {
      siftVersesWithLLM: (
        question: string,
        scoredMatches: unknown[],
        maxVerses: number,
      ) => Promise<VerseRef[]>;
    };
    vi.spyOn(pluginMethods, "siftVersesWithLLM").mockResolvedValue([VerseRef.fromOSIS("John.3.16")]);

    await plugin.onload();

    expect(pluginAny.embeddingSearchDB.initialize).not.toHaveBeenCalled();
    expect(app.commandPalette.registerPalette).toHaveBeenCalledWith(
      expect.objectContaining({ id: AIEmbeddingSearchCategoryID }),
    );

    const tool = app.toolsAPI
      .getTools()
      .find(
        (entry: { definition: { function: { name: string } } }) =>
          entry.definition.function.name === "sift_verses_with_llm",
      );

    expect(tool).toBeDefined();
    await expect(
      tool?.execute({
        question: "Who is Jesus?",
        candidates: [{ osis: "John.3.16", ref: "John 3:16", score: 2, text: "For God so loved the world." }],
        maxVerses: 1,
      }),
    ).resolves.toEqual({ primaryVerses: ["John.3.16"] });
  });
});
