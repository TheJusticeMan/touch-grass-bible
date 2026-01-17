import { BrowserConsole } from "./main";

export class AIchat {
  static ChatbotCommunicationGuidelines: string = `You are Pure Chat LLM, a personality created by the great Justice Vellacott. You are running on a large language model. Carefully heed the user's instructions. Respond using Markdown.

Be attentive, thoughtful, and precise. Provide clear, well-structured answers that honor the complexity of each query. Avoid generic responses; instead, offer insights that encourage creativity, reflection, and learning. Employ subtle, dry humor or depth when appropriate. Respect the user's individuality and values, adapting your tone and approach as needed to foster a conversational, meaningful, and genuinely supportive exchange.`;

  messages: { role: string; content: string }[] = [];
  console: BrowserConsole;
  endpoint: { endpoint: string; apiKey: string } = {
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
  };

  constructor() {
    this.messages.push({
      role: "system",
      content: AIchat.ChatbotCommunicationGuidelines,
    });
    this.console = new BrowserConsole(true, "AIchat:");
  }

  request(message: string, streamcallback?: (textFragment: any) => boolean) {
    this.addUserMessage(message);
    if (!this.endpoint.apiKey) {
      this.console.error("API key is not set.");
      return Promise.reject(new Error("API key is not set."));
    }
    return this.sendChatRequest(
      {
        model: "gpt-4.1-nano",
        messages: this.messages,
        max_tokens: 1000,
        stream: true,
      },
      streamcallback
    ).then(response => this.addAssistantMessage(response.content));
    //.catch(error => this.console.error("Error during chat request:", error));
  }

  addUserMessage(message: string) {
    this.messages.push({ role: "user", content: message });
    return this;
  }

  addAssistantMessage(message: string) {
    this.messages.push({ role: "assistant", content: message });
    return this;
  }

  getMessages(): { role: string; content: string }[] {
    return this.messages;
  }

  get Headers(): Record<string, string> {
    if (this.endpoint.endpoint.includes("api.anthropic.com")) {
      return {
        "x-api-key": this.endpoint.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      };
    }
    return {
      Authorization: `Bearer ${this.endpoint.apiKey}`,
      "content-type": "application/json",
    };
  }

  /**
   * Handles streaming responses from a fetch Response object.
   * Calls the provided callback with each parsed data fragment.
   * Returns the concatenated content as a string.
   */
  static async handleStreamingResponse(
    response: Response,
    streamcallback: (textFragment: any) => boolean
  ): Promise<{ role: string; content?: string; tool_calls?: any[] }> {
    if (!response.body) {
      throw new Error("Response body is null. Streaming is not supported in this environment.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;
    let buffer = "";
    let fullText = "";
    const fullcalls: any[] = [];

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          const dataStr = trimmedLine.replace(/^data:\s*/, "");
          if (dataStr === "[DONE]") {
            done = true;
            break;
          }
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices?.[0]?.delta;
            if (delta?.content) {
              fullText += delta.content;
              const continueProcessing = streamcallback(delta);
              if (!continueProcessing) {
                done = true;
                break;
              }
            } else if (delta?.tool_calls) {
              (delta.tool_calls as any[]).forEach((call: any) => {
                const index = call.index;
                if (!fullcalls[index]) fullcalls[index] = call;
                if (call.function.arguments) {
                  if (!fullcalls[index].function.arguments) {
                    fullcalls[index].function.arguments = "";
                  }
                  fullcalls[index].function.arguments += `${call.function.arguments}`;
                }
              });
            }
          } catch (err) {
            // Optionally handle parse errors
          }
        }
      }
    }

    if (fullcalls.length > 0) {
      fullcalls.forEach(call => {
        delete call.index; // Remove index from tool calls
      });
      console.log("Full tool calls:", fullcalls);
      return { role: "assistant", tool_calls: fullcalls };
    }
    return { role: "assistant", content: fullText };
  }

  /**
   * Sends a chat request to the specified endpoint with the provided options.
   *
   * @param options - The options for the chat request, including any parameters
   * required by the API. If `stream` is enabled, the `streamcallback` must also
   * be provided.
   * @param streamcallback - An optional callback function that processes text
   * fragments when streaming is enabled. The callback should return `true` to
   * continue streaming or `false` to stop.
   * @returns A promise that resolves to the chat response. If streaming is enabled,
   * the response contains the full concatenated text from the stream. Otherwise,
   * it returns the first message choice from the API response.
   * @throws An error if the network request fails or the response is not successful.
   */
  async sendChatRequest(options: any, streamcallback?: (textFragment: any) => boolean): Promise<any> {
    this.console.log("Sending chat request with options:", options);
    const response = await fetch(this.endpoint.endpoint, {
      method: "POST",
      headers: this.Headers,
      body: JSON.stringify({
        ...options,
        stream: options.stream && !!streamcallback,
      }),
    });

    if (!response.ok) {
      this.console.error(`Network error: ${response.statusText}`);
      throw new Error(`Network error: ${response.statusText}`);
    }

    if (options.stream && !!streamcallback) {
      const fullText = await AIchat.handleStreamingResponse(response, streamcallback);
      return fullText;
    } else {
      const data = await response.json();
      return data.choices[0].message;
    }
  }
}
