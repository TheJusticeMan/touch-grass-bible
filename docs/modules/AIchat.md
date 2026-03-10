# `AIchat` — AI Chat Integration

**File:** `src/AIchat.ts`  
**Class:** `AIchat`  
**Status:** In progress / experimental

---

## Purpose

`AIchat` provides an OpenAI-compatible chat interface with streaming support. It is designed to be used as the backbone for an AI Bible study assistant feature — asking questions about verses, theology, or context and getting streamed responses.

The class also supports Anthropic (Claude) API endpoints via header auto-detection.

---

## Class Structure

```typescript
export class AIchat {
  static ChatbotCommunicationGuidelines: string   // System prompt
  messages: { role: string; content: string }[]   // Conversation history
  console: BrowserConsole
  endpoint: { endpoint: string; apiKey: string }  // API configuration
}
```

---

## Configuration

### Default Endpoint

```typescript
endpoint = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",  // Must be set before use
};
```

The `apiKey` must be set before calling `request()`. An empty key causes the request to be rejected with an error.

### API Headers

Headers are automatically selected based on the endpoint URL:

**OpenAI (default):**
```http
Authorization: Bearer {apiKey}
Content-Type: application/json
```

**Anthropic (if endpoint includes `api.anthropic.com`):**
```http
x-api-key: {apiKey}
anthropic-version: 2023-06-01
Content-Type: application/json
```

---

## System Prompt

The static `ChatbotCommunicationGuidelines` provides the AI's persona:

```
You are Pure Chat LLM, a personality created by the great Justice Vellacott.
Be attentive, thoughtful, and precise. Provide clear, well-structured answers...
Respond using Markdown.
```

This is automatically prepended to every conversation as the first system message.

---

## API

### `request(message, streamcallback?)`

```typescript
request(
  message: string,
  streamcallback?: (textFragment: any) => boolean
): Promise<any>
```

Sends a message and gets a response. The stream callback receives delta chunks as they arrive.

- The callback returns `true` to continue streaming, `false` to stop early.
- After streaming completes, the full assistant response is added to `this.messages`.
- Uses model `"gpt-4.1-nano"` with `max_tokens: 1000`.

### `addUserMessage(message)` / `addAssistantMessage(message)`

Manually push messages to the conversation history (chainable).

### `getMessages()`

Returns the full conversation history array.

### `static handleStreamingResponse(response, streamcallback)`

Handles the SSE (Server-Sent Events) streaming format:
- Reads from the response body stream using `ReadableStream` / `TextDecoder`
- Parses `data: {...}` lines
- Stops on `data: [DONE]`
- Supports both `content` deltas (text) and `tool_calls` deltas (function calls)
- Returns the fully assembled `{ role, content }` or `{ role, tool_calls }` object

### `sendChatRequest(options, streamcallback?)`

Low-level method that makes the actual `fetch` POST request and delegates to `handleStreamingResponse` if streaming is enabled.

---

## Integration Status

The `AIchat` class exists as a standalone class but is **not yet integrated** into the main application UI. The `AI.ts` plugin (`src/plugins/AI.ts`) is a stub:

```typescript
// src/plugins/AI.ts
export default class AIPlugin extends Plugin {
  async onload() {
    // TODO: register AI chat palette category
  }
}
```

The AI plugin is not loaded in `main.ts` at this time.

---

## Potential Usage

When fully integrated, it could power:
- A "Chat about this verse" command palette category
- A contextual assistant explaining passages
- A study helper generating cross-references or commentary
- A search enhancement using semantic similarity

---

## Security Considerations

- The API key is stored in the `AIchat` instance in memory — it is **not** persisted to `localStorage` or settings.
- Users would need to enter their API key each session (or it could be stored in settings with appropriate warnings).
- API requests go directly from the browser to the AI provider endpoint — no server-side proxy.

See [improvements/features.md](../improvements/features.md) for enhancement proposals.
