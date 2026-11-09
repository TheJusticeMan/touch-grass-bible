// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { CommandPalette, type Command } from "./CommandPalette";
import { Workspace } from "./Workspace";
import type { App } from "./App";
import type { PanelContainerSerialized } from "./Workspace/Types";

const MINIMAL_LAYOUT: PanelContainerSerialized = {
  type: "panel",
  direction: "horizontal",
  activeIndex: 0,
  size: 1,
  children: [],
};

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: "test-command",
    name: "Test Command",
    description: "Test Description",
    icon: [["path", { d: "M0 0" }]] as unknown as Command["icon"],
    ...overrides,
  };
}

function makeAppStub() {
  const app = {
    platformBridge: {},
    files: {
      loadConfig: async () => "",
      saveConfig: async () => {},
    },
    workspace: undefined as unknown as Workspace,
  };

  const workspace = new Workspace(document.body, MINIMAL_LAYOUT, app as unknown as App);
  app.workspace = workspace;

  const palette = new CommandPalette(app as unknown as App);
  workspace.layout.registerView("command-palette", () => palette);

  return { workspace, palette };
}

async function flushMicrotasks(turns = 1): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

function commandTitles(): string[] {
  return Array.from(document.querySelectorAll(".floating-view.command-palette .command-title")).map(
    el => el.textContent?.trim() || "",
  );
}

describe("CommandPalette floating view reactivity", () => {
  test("keeps command list reactive after closing from floating view and reopening", async () => {
    document.body.innerHTML = "";
    const { palette } = makeAppStub();
    await flushMicrotasks(2);

    palette.open({ topCategory: "commands" });
    await flushMicrotasks(2);
    expect(palette.state.topCategory.val).toBe("commands");

    palette.commands.add(makeCommand({ id: "first-command", name: "First Command" }));
    palette.commands.add(makeCommand({ id: "second-command", name: "Second Command" }));
    await flushMicrotasks(1);
    expect(commandTitles()).toContain("First Command");

    const firstInput = document.querySelector(
      ".floating-view.command-palette .palette-search",
    ) as HTMLInputElement | null;
    expect(firstInput).not.toBeNull();
    firstInput!.value = "first";
    firstInput?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks(1);
    expect(palette.state.query.val).toBe("first");
    expect(commandTitles()).toEqual(["First Command"]);

    const backdrop = document.querySelector(".floating-view-wrapper .backdrop");
    expect(backdrop).not.toBeNull();
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks(2);
    expect(document.querySelector(".floating-view.command-palette")).toBeNull();

    palette.open({ topCategory: "commands" });
    await flushMicrotasks(2);
    expect(palette.state.topCategory.val).toBe("commands");

    const reopenedInput = document.querySelector(
      ".floating-view.command-palette .palette-search",
    ) as HTMLInputElement | null;
    expect(reopenedInput).not.toBeNull();
    reopenedInput!.value = "second";
    reopenedInput?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks(3);
    expect(palette.state.query.val).toBe("second");
    expect(palette.commands.getItems().map(item => item.name)).toContain("Second Command");
    expect(commandTitles()).toContain("Second Command");
    expect(commandTitles()).toEqual(["Second Command"]);
  });
});
