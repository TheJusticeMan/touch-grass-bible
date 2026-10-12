import { ToolCall, ToolCallDelta, ToolDefinition, ToolResult, ToolsAPI } from "../../core/ToolsAPI";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ChatDelta = {
  content?: string | null;
  tool_calls?: ToolCallDelta[];
};

export type ChatResponse = {
  role: "assistant";
  content?: string | null;
  tool_calls?: ToolCall[];
};

export type ChatRequestOptions = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  signal?: AbortSignal;
};

export type StreamCallback = (delta: ChatDelta) => boolean | void;

export type RequestHandlerOptions = {
  endpoint?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  maxToolRounds?: number;
};

type ChatCompletionPayload = {
  choices?: Array<{ message?: ChatResponse }>;
};

/**
 * Sends OpenAI-compatible Chat Completions requests and completes local function calls.
 *
 * The handler is deliberately independent of the AI UI so another compatible endpoint can
 * reuse it by supplying a different endpoint and key.
 */
export class RequestHandler {
  endpoint: string;
  apiKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly maxToolRounds: number;

  constructor(
    private readonly toolsAPI: ToolsAPI,
    options: RequestHandlerOptions = {},
  ) {
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/chat/completions";
    this.apiKey = options.apiKey ?? "";
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.maxToolRounds = options.maxToolRounds ?? 8;
  }

  get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Sends one completion request. For streaming requests, provide a callback to receive
   * content and tool-call deltas; returning false stops reading the response stream.
   */
  async sendChatRequest(options: ChatRequestOptions, onDelta?: StreamCallback): Promise<ChatResponse> {
    if (!this.apiKey) throw new Error("API key is not set.");

    const shouldStream = options.stream === true && !!onDelta;
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: this.headers,
      signal: options.signal,
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.max_tokens,
        tools: this.toOpenAITools(options.tools ?? this.toolsAPI.getToolsForLLM()),
        tool_choice: options.tool_choice,
        stream: shouldStream,
      }),
    });

    if (!response.ok) throw new Error(`Chat completion failed (${response.status} ${response.statusText}).`);

    if (shouldStream) return RequestHandler.handleStreamingResponse(response, onDelta);

    const payload = (await response.json()) as ChatCompletionPayload;
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Chat completion response did not contain a message.");
    return message;
  }

  /**
   * Continues completion requests until the model responds with text or the tool-round
   * limit is reached. The provided messages array is never mutated.
   */
  async request(options: ChatRequestOptions, onDelta?: StreamCallback): Promise<ChatResponse> {
    const messages = [...options.messages];

    for (let round = 0; round <= this.maxToolRounds; round++) {
      const response = await this.sendChatRequest({ ...options, messages }, onDelta);
      const toolCalls = response.tool_calls ?? [];
      if (toolCalls.length === 0) return response;
      if (round === this.maxToolRounds) {
        throw new Error(`Tool-call limit (${this.maxToolRounds}) reached without a final response.`);
      }

      messages.push({
        role: "assistant",
        content: response.content ?? null,
        tool_calls: toolCalls,
      });
      messages.push(...(await this.executeToolCalls(toolCalls)));
    }

    throw new Error("Unable to complete chat request.");
  }

  static async handleStreamingResponse(response: Response, onDelta: StreamCallback): Promise<ChatResponse> {
    if (!response.body) throw new Error("Streaming is not supported because the response body is empty.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolCalls: ToolCall[] = [];
    let buffer = "";
    let content = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const data = line.match(/^data:\s?(.*)$/)?.[1];
          if (!data) continue;
          if (data === "[DONE]") return RequestHandler.completedStream(content, toolCalls);

          let delta: ChatDelta | undefined;
          try {
            delta = (JSON.parse(data) as { choices?: Array<{ delta?: ChatDelta }> }).choices?.[0]?.delta;
          } catch {
            continue;
          }
          if (!delta) continue;

          if (delta.content) content += delta.content;
          RequestHandler.mergeToolCallDeltas(toolCalls, delta.tool_calls);
          if (onDelta(delta) === false) {
            await reader.cancel();
            return RequestHandler.completedStream(content, toolCalls);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return RequestHandler.completedStream(content, toolCalls);
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map(toolCall => this.executeToolCall(toolCall)));
  }

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const toolCallId = toolCall.id;
    const name = toolCall.function.name;
    if (!toolCallId || !name) {
      return this.toolResult(toolCallId ?? "unknown", name ?? "unknown", {
        error: "The model returned a tool call without an id or name.",
      });
    }

    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(toolCall.function.arguments || "{}");
      if (!RequestHandler.isRecord(parsed)) throw new Error("Tool arguments must be a JSON object.");
      args = parsed;
    } catch (error) {
      return this.toolResult(toolCallId, name, {
        error: `Invalid tool arguments: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    try {
      const result = await this.toolsAPI.parseAndExecuteTool(toolCall, args);
      if (result === undefined && !this.toolsAPI.parseToolCall(toolCall)) {
        return this.toolResult(toolCallId, name, { error: `Unknown tool: ${name}` });
      }
      return this.toolResult(toolCallId, name, { result: result ?? null });
    } catch (error) {
      return this.toolResult(toolCallId, name, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private toOpenAITools(tools: ToolDefinition[]): ToolDefinition[] {
    return tools.map(tool => ({ ...tool, type: "function" }));
  }

  private toolResult(toolCallId: string, name: string, content: unknown): ToolResult {
    return {
      role: "tool",
      tool_call_id: toolCallId,
      name,
      content: JSON.stringify(content),
    };
  }

  private static completedStream(content: string, toolCalls: ToolCall[]): ChatResponse {
    return toolCalls.length > 0
      ? { role: "assistant", content: content || null, tool_calls: toolCalls }
      : { role: "assistant", content };
  }

  private static mergeToolCallDeltas(toolCalls: ToolCall[], deltas?: ToolCallDelta[]): void {
    for (const delta of deltas ?? []) {
      const index = delta.index;
      if (index === undefined) continue;
      const existing = toolCalls[index] ?? { id: "", type: "function", function: { name: "", arguments: "" } };
      existing.id = delta.id ?? existing.id;
      existing.type = delta.type ?? existing.type;
      existing.function.name = delta.function.name ?? existing.function.name;
      existing.function.arguments += delta.function.arguments ?? "";
      toolCalls[index] = existing;
    }
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
