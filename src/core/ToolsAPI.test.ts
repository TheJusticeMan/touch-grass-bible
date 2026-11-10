import { describe, expect, it, vi } from "vitest";
import { ToolsAPI, type Tool } from "./ToolsAPI";

describe("ToolsAPI", () => {
  it("validates arguments against the registered parameter schema before execution", async () => {
    const api = new ToolsAPI();
    const execute = vi.fn((args: { reference: string }) => args.reference);
    const tool: Tool<{ reference: string }, string> = {
      definition: {
        function: {
          name: "lookup_verse",
          parameters: {
            type: "object" as const,
            properties: { reference: { type: "string" as const } },
            required: ["reference"],
            additionalProperties: false,
          },
        },
      },
      execute,
    };
    api.registerTool(tool);

    await expect(api.executeTool(tool, {} as { reference: string })).rejects.toThrow(/reference.*required/i);
    await expect(
      api.executeTool(tool, { reference: 123 } as unknown as { reference: string }),
    ).rejects.toThrow(/reference.*string/i);
    await expect(
      api.executeTool(tool, { reference: "John 3:16", extra: true } as unknown as { reference: string }),
    ).rejects.toThrow(/extra.*not allowed/i);
    expect(execute).not.toHaveBeenCalled();
    await expect(api.executeTool(tool, { reference: "John 3:16" })).resolves.toBe("John 3:16");
  });

  it("rejects duplicate registered names", () => {
    const api = new ToolsAPI();
    api.registerTool({ definition: { function: { name: "same" } }, execute: () => "first" });

    expect(() =>
      api.registerTool({ definition: { function: { name: "same" } }, execute: () => "second" }),
    ).toThrow(/already registered/i);
  });

  it("names plugin tools by owner so trust grants cannot transfer to another plugin", async () => {
    const api = new ToolsAPI();
    const tool = { definition: { function: { name: "read" } }, execute: () => "ok" };
    api.registerTool(tool, "trusted-plugin");

    expect(api.getToolIdentifier(tool)).toBe("trusted-plugin:read");
    api.unregisterTool(tool);
    expect(api.getToolIdentifier(tool)).toBe("read");
    await expect(api.executeTool(tool, {})).rejects.toThrow(/no longer registered/i);
  });
});
