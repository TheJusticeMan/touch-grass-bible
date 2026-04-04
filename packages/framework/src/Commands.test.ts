import { describe, test, expect, vi } from "vitest";
import { Commands } from "./Commands";
import type { Command } from "./Commands";
import { BookOpen } from "lucide";

const makeCommand = (id: string, overrides: Partial<Command> = {}): Command => ({
  name: `Command ${id}`,
  id,
  description: `Description for ${id}`,
  icon: BookOpen,
  callback: vi.fn(),
  ...overrides,
});

describe("Commands", () => {
  test("addCommand stores a command retrievable by getCommand", () => {
    const commands = new Commands();
    const cmd = makeCommand("cmd.one");
    commands.addCommand(cmd);
    expect(commands.getCommand("cmd.one")).toBe(cmd);
  });

  test("getCommand returns undefined for an unknown id", () => {
    const commands = new Commands();
    expect(commands.getCommand("nope")).toBeUndefined();
  });

  test("commands getter returns all added commands", () => {
    const commands = new Commands();
    const c1 = makeCommand("a");
    const c2 = makeCommand("b");
    commands.addCommand(c1);
    commands.addCommand(c2);
    expect(commands.commands).toEqual(expect.arrayContaining([c1, c2]));
    expect(commands.commands).toHaveLength(2);
  });

  test("commands getter returns empty array when no commands added", () => {
    const commands = new Commands();
    expect(commands.commands).toEqual([]);
  });

  test("removeCommand deletes the command", () => {
    const commands = new Commands();
    commands.addCommand(makeCommand("del.me"));
    commands.removeCommand("del.me");
    expect(commands.getCommand("del.me")).toBeUndefined();
    expect(commands.commands).toHaveLength(0);
  });

  test("removeCommand on unknown id does not throw", () => {
    const commands = new Commands();
    expect(() => commands.removeCommand("ghost")).not.toThrow();
  });

  test("addCommand overwrites a duplicate id (with console.warn)", () => {
    const commands = new Commands();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = makeCommand("dup");
    const second = makeCommand("dup");
    commands.addCommand(first);
    commands.addCommand(second);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(commands.getCommand("dup")).toBe(second);
    warnSpy.mockRestore();
  });

  test("executeCommand calls callback when present", () => {
    const commands = new Commands();
    const callback = vi.fn();
    commands.addCommand(makeCommand("run.me", { callback, checkCallback: undefined }));
    commands.executeCommand("run.me");
    expect(callback).toHaveBeenCalledOnce();
  });

  test("executeCommand uses checkCallback when defined", () => {
    const commands = new Commands();
    const checkCallback = vi.fn((checking: boolean) => (checking ? true : undefined));
    commands.addCommand(makeCommand("check.cmd", { checkCallback, callback: undefined }));
    commands.executeCommand("check.cmd");
    // checkCallback(true) is called first; if truthy, checkCallback(false) follows
    expect(checkCallback).toHaveBeenCalledWith(true);
    expect(checkCallback).toHaveBeenCalledWith(false);
  });

  test("executeCommand skips checkCallback(false) when checkCallback(true) is falsy", () => {
    const commands = new Commands();
    const checkCallback = vi.fn(() => false);
    commands.addCommand(makeCommand("disabled.cmd", { checkCallback, callback: undefined }));
    commands.executeCommand("disabled.cmd");
    expect(checkCallback).toHaveBeenCalledTimes(1);
    expect(checkCallback).toHaveBeenCalledWith(true);
  });

  test("executeCommand warns and does nothing for unknown id", () => {
    const commands = new Commands();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    commands.executeCommand("missing");
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
