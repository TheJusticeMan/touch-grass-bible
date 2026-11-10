// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import van from "vanjs-core";
import { CommandCategory, CommandPalette, type CommandPaletteState } from "./CommandPalette";
import { Workspace } from "./Workspace";
import type { App } from "./App";
import type { PanelContainerSerialized } from "./Workspace/Types";
import type { stateMapping } from "./Workspace";

const MINIMAL_LAYOUT: PanelContainerSerialized = {
  type: "panel",
  direction: "horizontal",
  activeIndex: 0,
  size: 1,
  children: [],
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

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
  return { palette };
}

async function flush(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

class AsyncTestCategory extends CommandCategory<string> {
  allItems = van.state<string[]>([]);
  criteria = [(item: string) => item];

  renderItem(item: string) {
    return { key: item, title: item, description: `Command ${item}` };
  }

  async load(loader: (signal: AbortSignal) => Promise<string[]>, query: string) {
    return this.loadItemsLatest(loader, {
      loadingMessage: `Loading ${query}`,
      successMessage: items => `Loaded ${items.length} item(s) for ${query}`,
    });
  }
}

describe("CommandPalette asynchronous category updates", () => {
  test("discards stale async results and keeps status from the latest request", async () => {
    const category = new AsyncTestCategory(
      {
        expanded: van.state(true),
        query: van.state(""),
        topCategory: van.state("async"),
        maxItems: van.state(15),
      } as stateMapping<CommandPaletteState>,
      "Async",
    );
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    let firstSignal: AbortSignal | undefined;

    const oldRequest = category.load(signal => {
      firstSignal = signal;
      return first.promise;
    }, "old");
    const latestRequest = category.load(() => second.promise, "latest");

    expect(firstSignal?.aborted).toBe(true);
    expect(category.asyncStatus.val).toEqual({ state: "loading", message: "Loading latest" });

    second.resolve(["latest result"]);
    await expect(latestRequest).resolves.toEqual({ status: "success", value: ["latest result"] });
    expect(category.allItems.val).toEqual(["latest result"]);

    first.resolve(["stale result"]);
    await expect(oldRequest).resolves.toEqual({ status: "stale" });
    expect(category.allItems.val).toEqual(["latest result"]);
    expect(category.asyncStatus.val).toEqual({
      state: "success",
      message: "Loaded 1 item(s) for latest",
    });
  });

  test("invalidates pending work when the category is disposed", async () => {
    const category = new AsyncTestCategory(
      {
        expanded: van.state(true),
        query: van.state(""),
        topCategory: van.state("async"),
        maxItems: van.state(15),
      } as stateMapping<CommandPaletteState>,
      "Async",
    );
    const pending = deferred<string[]>();
    let signal: AbortSignal | undefined;

    const request = category.load(currentSignal => {
      signal = currentSignal;
      return pending.promise;
    }, "pending");
    category.dispose();
    pending.resolve(["too late"]);

    expect(signal?.aborted).toBe(true);
    await expect(request).resolves.toEqual({ status: "stale" });
    expect(category.allItems.val).toEqual([]);
    expect(category.asyncStatus.val).toEqual({ state: "idle", message: "" });
  });

  test("renders async status without making it a selectable command", async () => {
    document.body.innerHTML = "";
    const { palette } = makeAppStub();
    const category = new AsyncTestCategory(palette.state, "Async");
    category.allItems.val = ["first"];
    palette.registerPalette({ id: "async", cfn: () => category });
    palette.open({ topCategory: "async" });
    await flush();

    const itemCount = document.querySelectorAll(".command-item").length;
    category.asyncStatus.val = { state: "loading", message: "Searching now" };
    await flush();

    expect(document.querySelector('[role="status"]')?.textContent).toContain("Searching now");
    expect(document.querySelectorAll(".command-item")).toHaveLength(itemCount);
    expect(document.querySelectorAll(".command-item.selected")).toHaveLength(1);
  });

  test("renders failed async work as status instead of adding a command row", async () => {
    document.body.innerHTML = "";
    const { palette } = makeAppStub();
    const category = new AsyncTestCategory(palette.state, "Async");
    category.allItems.val = ["first"];
    palette.registerPalette({ id: "async", cfn: () => category });
    palette.open({ topCategory: "async" });
    await flush();
    const itemCount = document.querySelectorAll(".command-item").length;

    await expect(category.load(async () => Promise.reject(new Error("offline")), "failure")).resolves.toEqual(
      {
        status: "error",
        error: new Error("offline"),
      },
    );
    await flush();

    expect(document.querySelector('[role="status"]')?.textContent).toContain("offline");
    expect(document.querySelector(".category-status-error")).not.toBeNull();
    expect(document.querySelectorAll(".command-item")).toHaveLength(itemCount);
  });

  test("preserves the selected command when an earlier category inserts async results", async () => {
    document.body.innerHTML = "";
    const { palette } = makeAppStub();
    const dynamic = new AsyncTestCategory(palette.state, "Dynamic");
    const later = new AsyncTestCategory(palette.state, "Later");
    dynamic.allItems.val = ["anchor"];
    later.allItems.val = ["stable command"];
    palette.registerPalette({ id: "dynamic", cfn: () => dynamic });
    palette.registerPalette({ id: "later", cfn: () => later });
    palette.open({ topCategory: "dynamic" });
    await flush();

    const commandRows = Array.from(document.querySelectorAll(".command-item"));
    const stableRow = commandRows.find(row => row.textContent?.includes("stable command"));
    expect(stableRow).toBeDefined();
    stableRow!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await flush();
    expect(document.querySelector(".command-item.selected .command-title")?.textContent).toBe(
      "stable command",
    );

    dynamic.asyncStatus.val = { state: "loading", message: "Searching" };
    dynamic.allItems.val = ["anchor", "new async result"];
    await flush();

    const selectedTitle = document.querySelector(".command-item.selected .command-title")?.textContent;
    expect(selectedTitle).toBe("stable command");
  });
});
