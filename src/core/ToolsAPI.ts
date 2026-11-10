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

export class ToolArgumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolArgumentValidationError";
  }
}

type RuntimeToolArgumentSchema = {
  type?: ToolArgumentSchema["type"];
  description?: string;
  properties?: Record<string, RuntimeToolArgumentSchema>;
  required?: string[];
  items?: RuntimeToolArgumentSchema;
  enum?: readonly unknown[];
  additionalProperties?: boolean | RuntimeToolArgumentSchema;
  nullable?: boolean;
  oneOf?: RuntimeToolArgumentSchema[];
  anyOf?: RuntimeToolArgumentSchema[];
  allOf?: RuntimeToolArgumentSchema[];
};

export function validateToolArguments(schema: unknown, value: unknown): void {
  if (isRecord(schema)) validateSchema(schema as RuntimeToolArgumentSchema, value, "$");
}

function validateSchema(schema: RuntimeToolArgumentSchema, value: unknown, path: string): void {
  const fail = (message: string): never => {
    throw new ToolArgumentValidationError(`${path} ${message}`);
  };

  if (value === null && schema.nullable) return;

  const typeMatches = (() => {
    switch (schema.type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return isRecord(value);
      case "null":
        return value === null;
      default:
        return true;
    }
  })();
  if (!typeMatches) fail(`must be ${schema.type}`);

  if (schema.enum && !schema.enum.some(item => deepEqual(item, value))) {
    fail(`must be one of the allowed enum values`);
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateSchema(schema.items!, item, `${path}[${index}]`));
  }

  if (isRecord(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new ToolArgumentValidationError(`${path}.${key} is required`);
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateSchema(propertySchema, value[key], `${path}.${key}`);
      }
    }

    for (const [key, propertyValue] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
      if (schema.additionalProperties === false) {
        throw new ToolArgumentValidationError(`${path}.${key} is not allowed`);
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateSchema(schema.additionalProperties, propertyValue, `${path}.${key}`);
      }
    }
  }

  for (const [keyword, branches] of [
    ["anyOf", schema.anyOf],
    ["oneOf", schema.oneOf],
  ] as const) {
    if (!branches) continue;
    const matching = branches.filter(branch => {
      try {
        validateSchema(branch, value, path);
        return true;
      } catch {
        return false;
      }
    }).length;
    if (keyword === "anyOf" && matching === 0) fail("does not match any allowed schema");
    if (keyword === "oneOf" && matching !== 1) fail("must match exactly one allowed schema");
  }

  for (const branch of schema.allOf ?? []) validateSchema(branch, value, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        key => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]),
      )
    );
  }
  return false;
}

export class ToolsAPI {
  tools = new Set<ToolEntry>();
  private readonly owners = new WeakMap<ToolEntry, string>();

  registerTool<TArgs extends Record<string, unknown>, TResult>(tool: Tool<TArgs, TResult>, ownerId?: string) {
    const existing = Array.from(this.tools).find(
      registered => registered.definition.function.name === tool.definition.function.name,
    );
    if (existing && existing !== tool) {
      throw new Error(`Tool "${tool.definition.function.name}" is already registered.`);
    }
    this.tools.add(tool as ToolEntry);
    if (ownerId) this.owners.set(tool as ToolEntry, ownerId);
  }

  unregisterTool(tool: ToolEntry) {
    this.tools.delete(tool);
    this.owners.delete(tool);
  }

  getToolIdentifier(tool: ToolEntry): string {
    const name = tool.definition.function.name;
    const ownerId = this.owners.get(tool);
    return ownerId ? `${ownerId}:${name}` : name;
  }

  getTools(): ToolEntry[] {
    return Array.from(this.tools);
  }

  getToolsForLLM(): ToolDefinition[] {
    return Array.from(this.tools).map(tool => tool.definition);
  }

  parseToolCall(toolCall: ToolCall): ToolEntry | undefined {
    const name = toolCall.function?.name;
    if (!name) return undefined;
    return Array.from(this.tools).find(tool => tool.definition.function.name === name);
  }

  executeTool<TArgs extends Record<string, unknown>, TResult>(
    tool: Tool<TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    return Promise.resolve().then(() => {
      if (!this.tools.has(tool as ToolEntry)) {
        throw new Error(`Tool "${tool.definition.function.name}" is no longer registered.`);
      }
      if (!isRecord(args)) throw new ToolArgumentValidationError("$ must be an object");
      validateToolArguments(tool.definition.function.parameters, args);
      return tool.execute(args);
    });
  }

  parseAndExecuteTool(toolCall: ToolCall, args: Record<string, unknown>): Promise<unknown> | undefined {
    const tool = this.parseToolCall(toolCall);
    if (!tool) return undefined;
    return this.executeTool(tool, args);
  }
}
