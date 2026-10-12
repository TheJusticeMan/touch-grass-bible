export type ToolArgumentSchema<TSchema = unknown> = {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  description?: string;
  properties?: {
    [K in keyof TSchema & string]?: ToolArgumentSchema<TSchema[K]>;
  };
  required?: (keyof TSchema & string)[];
  items?: ToolArgumentSchema<TSchema extends Array<infer TItem> ? TItem : unknown>;
  enum?: readonly TSchema[];
  default?: TSchema;
  additionalProperties?:
    boolean | ToolArgumentSchema<TSchema extends Record<string, unknown> ? TSchema[keyof TSchema] : unknown>;
  nullable?: boolean;
  oneOf?: ToolArgumentSchema<TSchema>[];
  anyOf?: ToolArgumentSchema<TSchema>[];
  allOf?: ToolArgumentSchema<TSchema>[];
};

export type ToolCallback<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> = (args: TArgs) => TResult | Promise<TResult>;

export type ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
  type?: "function";
  function: {
    name: string;
    description?: string;
    parameters?: ToolArgumentSchema<TArgs>;
  };
};

export type Tool<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> = {
  definition: ToolDefinition<TArgs>;
  execute: ToolCallback<TArgs, TResult>;
};

export type ToolCallFunction = {
  name: string;
  arguments: string;
};

export type ToolCall = {
  index?: number;
  id?: string;
  type?: "function";
  function: {
    name?: string;
    arguments: string;
  };
};

export type ToolCallDelta = ToolCall;

export type ToolResult = {
  role: "tool";
  tool_call_id: string;
  name: string;
  content: string;
};

export type ToolEntry = Tool<Record<string, unknown>, unknown>;

export class ToolsAPI {
  tools = new Set<ToolEntry>();

  registerTool<TArgs extends Record<string, unknown>, TResult>(tool: Tool<TArgs, TResult>) {
    this.tools.add(tool as ToolEntry);
  }

  unregisterTool(tool: ToolEntry) {
    this.tools.delete(tool);
  }

  getTools(): ToolEntry[] {
    return Array.from(this.tools);
  }

  getToolsForLLM(): ToolDefinition[] {
    return Array.from(this.tools).map(tool => tool.definition);
  }

  parseToolCall(toolCall: ToolCall): ToolEntry | undefined {
    return Array.from(this.tools).find(tool => tool.definition.function.name === toolCall.function.name);
  }

  executeTool(tool: ToolEntry, args: Record<string, unknown>): Promise<unknown> {
    return Promise.resolve(tool.execute(args));
  }

  parseAndExecuteTool(toolCall: ToolCall, args: Record<string, unknown>): Promise<unknown> | undefined {
    const tool = this.parseToolCall(toolCall);
    if (!tool) return undefined;
    return this.executeTool(tool, args);
  }
}
