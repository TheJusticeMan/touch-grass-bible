import { describe, expect, test, vi } from "vitest";
import { Commands } from "./CommandPalette";
import van from "vanjs-core";
import type { Command } from "./CommandPalette";
import type { CommandPaletteState } from "./CommandPalette";
import type { stateMapping } from "./Workspace";

function makeState(): stateMapping<CommandPaletteState> {
  return {
    expanded: van.state(true),
    query: van.state(""),
    topCategory: van.state(""),
    maxItems: van.state(15),
  };
}

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: "test-command",
    name: "Test Command",
    description: "Does nothing",
    icon: [["path", { d: "M0 0" }]] as unknown as Command["icon"],
    ...overrides,
  };
}

describe("Commands - add", () => {
  test("adds a command and makes it retrievable", () => {
    const cmds = new Commands(makeState());
    const cmd = makeCommand();
    cmds.add(cmd);
    expect(cmds.get("test-command")).toBe(cmd);
  });

  test("syncs the reactive commands array", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand({ id: "a", name: "A" }));
    cmds.add(makeCommand({ id: "b", name: "B" }));
    expect(cmds.commands.val).toHaveLength(2);
    expect(cmds.commands.val.map(c => c.id)).toEqual(["a", "b"]);
  });

  test("overwrites a command with the same id", () => {
    const cmds = new Commands(makeState());
    const first = makeCommand({ name: "First" });
    const second = makeCommand({ name: "Second" });
    cmds.add(first);
    cmds.add(second);
    expect(cmds.get("test-command")?.name).toBe("Second");
    expect(cmds.commands.val).toHaveLength(1);
  });

  test("logs a warning when overwriting a command", () => {
    const cmds = new Commands(makeState());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    cmds.add(makeCommand());
    cmds.add(makeCommand());
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("test-command");
    warnSpy.mockRestore();
  });
});

describe("Commands - delete", () => {
  test("removes the command and updates the reactive array", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand({ id: "keep" }));
    cmds.add(makeCommand({ id: "remove" }));
    cmds.delete("remove");
    expect(cmds.get("remove")).toBeUndefined();
    expect(cmds.commands.val.map(c => c.id)).toEqual(["keep"]);
  });

  test("is a no-op for unknown ids", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand());
    expect(() => cmds.delete("no-such-id")).not.toThrow();
    expect(cmds.commands.val).toHaveLength(1);
  });
});

describe("Commands - has / get", () => {
  test("has returns false before adding", () => {
    const cmds = new Commands(makeState());
    expect(cmds.has("x")).toBe(false);
  });

  test("has returns true after adding", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand({ id: "x" }));
    expect(cmds.has("x")).toBe(true);
  });

  test("has returns false after deletion", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand({ id: "x" }));
    cmds.delete("x");
    expect(cmds.has("x")).toBe(false);
  });

  test("get returns undefined for unknown id", () => {
    const cmds = new Commands(makeState());
    expect(cmds.get("nope")).toBeUndefined();
  });
});

describe("Commands - available", () => {
  test("returns false for missing command id", () => {
    const cmds = new Commands(makeState());
    expect(cmds.available("missing")).toBe(false);
  });

  test("returns true for command with plain callback (no checkCallback)", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand({ callback: vi.fn() }));
    expect(cmds.available("test-command")).toBe(true);
  });

  test("returns result of checkCallback(true) when it is defined", () => {
    const cmds = new Commands(makeState());
    const checkCallback = vi.fn().mockReturnValue(true);
    cmds.add(makeCommand({ checkCallback }));
    expect(cmds.available("test-command")).toBe(true);
    expect(checkCallback).toHaveBeenCalledWith(true);
  });

  test("returns false when checkCallback(true) returns false", () => {
    const cmds = new Commands(makeState());
    const checkCallback = vi.fn().mockReturnValue(false);
    cmds.add(makeCommand({ checkCallback }));
    expect(cmds.available("test-command")).toBe(false);
  });

  test("returns true for command with no callback and no checkCallback", () => {
    const cmds = new Commands(makeState());
    cmds.add(makeCommand({ callback: undefined, checkCallback: undefined }));
    expect(cmds.available("test-command")).toBe(true);
  });
});

describe("Commands - execute", () => {
  test("calls callback for a plain command", () => {
    const cmds = new Commands(makeState());
    const callback = vi.fn();
    cmds.add(makeCommand({ callback }));
    cmds.execute("test-command");
    expect(callback).toHaveBeenCalledOnce();
  });

  test("calls checkCallback(false) when checkCallback(true) returns truthy", () => {
    const cmds = new Commands(makeState());
    const checkCallback = vi.fn().mockReturnValue(true);
    cmds.add(makeCommand({ checkCallback }));
    cmds.execute("test-command");
    expect(checkCallback).toHaveBeenCalledWith(true);
    expect(checkCallback).toHaveBeenCalledWith(false);
  });

  test("does NOT call checkCallback(false) when checkCallback(true) returns falsy", () => {
    const cmds = new Commands(makeState());
    const checkCallback = vi.fn().mockReturnValue(false);
    cmds.add(makeCommand({ checkCallback }));
    cmds.execute("test-command");
    expect(checkCallback).toHaveBeenCalledWith(true);
    expect(checkCallback).not.toHaveBeenCalledWith(false);
  });

  test("logs a warning and does not throw for unknown command id", () => {
    const cmds = new Commands(makeState());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => cmds.execute("ghost")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  test("does not call callback when command has checkCallback", () => {
    const cmds = new Commands(makeState());
    const callback = vi.fn();
    const checkCallback = vi.fn().mockReturnValue(true);
    cmds.add(makeCommand({ callback, checkCallback }));
    cmds.execute("test-command");
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("Commands - getItems (search)", () => {
  test("returns all commands when query is empty", () => {
    const state = makeState();
    const cmds = new Commands(state);
    cmds.add(makeCommand({ id: "a", name: "Alpha" }));
    cmds.add(makeCommand({ id: "b", name: "Beta" }));
    expect(cmds.getItems()).toHaveLength(2);
  });

  test("filters commands by name (case-insensitive)", () => {
    const state = makeState();
    state.query.val = "alpha";
    const cmds = new Commands(state);
    cmds.add(makeCommand({ id: "a", name: "Alpha Command" }));
    cmds.add(makeCommand({ id: "b", name: "Beta Command" }));
    expect(cmds.getItems().map(c => c.id)).toEqual(["a"]);
  });

  test("filters commands by description", () => {
    const state = makeState();
    state.query.val = "navigate";
    const cmds = new Commands(state);
    cmds.add(makeCommand({ id: "a", name: "Foo", description: "Navigate somewhere" }));
    cmds.add(makeCommand({ id: "b", name: "Bar", description: "Something else" }));
    const results = cmds.getItems();
    expect(results.map(c => c.id)).toEqual(["a"]);
  });

  test("returns empty array when no commands match", () => {
    const state = makeState();
    state.query.val = "zzznomatch";
    const cmds = new Commands(state);
    cmds.add(makeCommand({ id: "a", name: "Alpha", description: "Alpha desc" }));
    expect(cmds.getItems()).toHaveLength(0);
  });

  test("name criteria is checked before description (no duplicates)", () => {
    const state = makeState();
    state.query.val = "test";
    const cmds = new Commands(state);
    // Both name and description contain "test" - should still appear once
    cmds.add(makeCommand({ id: "a", name: "test thing", description: "test desc" }));
    expect(cmds.getItems()).toHaveLength(1);
  });
});

describe("Commands - renderItem (icon rendering bug)", () => {
  test("icon.toString() on a Lucide IconNode yields '[object Array]' (documents the bug)", () => {
    // Lucide IconNode is an array: [["path", { d: "..." }]]
    // The buggy code in renderItem called: path({ d: item.icon.toString() })
    // Calling .toString() on an array always produces "path,M10 20v-6h4v6" (joined children)
    // which is NOT valid SVG path data by itself.
    const iconNode = [["path", { d: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" }]] as unknown as Command["icon"];
    expect(iconNode.toString()).not.toBe("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z");
    // renderIcon(iconNode) is the correct approach - it knows how to interpret IconNode arrays.
  });
});
