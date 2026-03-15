// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { View, Workspace } from "./Workspace";

function installWorkspaceDomPolyfills(): void {
  const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;

  if (typeof prototype.empty !== "function") {
    Object.defineProperty(prototype, "empty", {
      configurable: true,
      value: function empty(this: HTMLElement): HTMLElement {
        this.replaceChildren();
        return this;
      },
    });
  }

  if (typeof prototype.createEl !== "function") {
    Object.defineProperty(prototype, "createEl", {
      configurable: true,
      value: function createEl<K extends keyof HTMLElementTagNameMap>(
        this: HTMLElement,
        tagName: K,
        options?: {
          text?: string;
          cls?: string | string[];
          attr?: Record<string, string>;
        },
        callback?: (el: HTMLElementTagNameMap[K]) => void,
      ): HTMLElementTagNameMap[K] {
        const el = document.createElement(tagName);
        if (options?.text !== undefined) {
          el.textContent = options.text;
        }
        if (options?.cls) {
          const classes = Array.isArray(options.cls) ? options.cls : [options.cls];
          el.classList.add(...classes);
        }
        if (options?.attr) {
          Object.entries(options.attr).forEach(([key, value]) => el.setAttribute(key, value));
        }
        this.appendChild(el);
        callback?.(el);
        return el;
      },
    });
  }

  if (typeof prototype.scrollIntoView !== "function") {
    Object.defineProperty(prototype, "scrollIntoView", {
      configurable: true,
      value: function scrollIntoView(): void {
        // no-op for tests
      },
    });
  }
}

installWorkspaceDomPolyfills();

class StatefulView extends View {
  value = "initial";

  getViewState(): unknown {
    return { value: this.value };
  }

  setViewState(state: unknown): void {
    if (!state || typeof state !== "object") return;
    const value = (state as { value?: unknown }).value;
    if (typeof value === "string") {
      this.value = value;
    }
  }
}

class ActivatingView extends View {
  static activations: string[] = [];

  constructor(
    panel: InstanceType<typeof View>["panel"],
    private readonly activationId: string,
  ) {
    super(panel);
  }

  override onActivate(): void {
    ActivatingView.activations.push(this.activationId);
  }
}

describe("Workspace active view tracking", () => {
  test("hydrates unresolved active view and tracks it by type", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.openView("verse-screen", panel, { activate: true, title: "Verse" });
    expect(workspace.getActiveViewOfType("verse-screen")).toBeNull();

    workspace.registerView("verse-screen", hydratedPanel => new View(hydratedPanel));

    const tracked = workspace.getActiveViewOfType("verse-screen");
    expect(tracked).not.toBeNull();
    expect(tracked?.viewTypeId).toBe("verse-screen");
    expect(workspace.activeView).toBe(tracked);
  });

  test("restores active view by saved index and keeps type tracking", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("one", viewPanel => new View(viewPanel));
    workspace.registerView("two", viewPanel => new View(viewPanel));

    workspace.openView("one", panel, { activate: false, title: "One" });
    workspace.openView("two", panel, { activate: true, title: "Two" });

    const serialized = workspace.serializeLayout();
    expect(serialized.activeViewPanelPath).toEqual([0]);
    expect(serialized.activeViewIndex).toBe(1);
    const restored = workspace.restoreLayout(serialized);

    expect(restored).toBe(true);
    expect(workspace.activeView?.viewTypeId).toBe("two");
    expect(workspace.getActiveViewOfType("two")).not.toBeNull();
  });

  test("restore only activates the saved active view", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    ActivatingView.activations = [];
    workspace.registerView("one", viewPanel => new ActivatingView(viewPanel, "one"));
    workspace.registerView("two", viewPanel => new ActivatingView(viewPanel, "two"));

    workspace.openView("one", panel, { activate: false, title: "One" });
    workspace.openView("two", panel, { activate: true, title: "Two" });
    const serialized = workspace.serializeLayout();

    ActivatingView.activations = [];
    const restored = workspace.restoreLayout(serialized);

    expect(restored).toBe(true);
    expect(ActivatingView.activations).toEqual(["two"]);
    expect(workspace.activeView?.viewTypeId).toBe("two");
  });

  test("serializes and restores registered view state", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("stateful", viewPanel => new StatefulView(viewPanel));
    workspace.openView("stateful", panel, { activate: true, title: "Stateful" });

    const opened = workspace.activeView as StatefulView;
    opened.value = "john-3-16";

    const serialized = workspace.serializeLayout();
    const savedState = serialized.rootPanel.children?.[0]?.panel.views?.[0]?.state as
      | { value?: string }
      | undefined;
    expect(savedState?.value).toBe("john-3-16");

    const restored = workspace.restoreLayout(serialized);
    expect(restored).toBe(true);

    const restoredView = workspace.activeView as StatefulView;
    expect(restoredView.value).toBe("john-3-16");
  });

  test("hydrates unresolved views with restored state", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.openView("stateful", panel, {
      activate: true,
      title: "Stateful",
      state: { value: "restored-unresolved" },
    });

    expect(workspace.activeView).toBeNull();

    workspace.registerView("stateful", viewPanel => new StatefulView(viewPanel));

    const hydrated = workspace.activeView as StatefulView;
    expect(hydrated).not.toBeNull();
    expect(hydrated.value).toBe("restored-unresolved");
  });

  test("opening a real view closes the active empty view in that panel", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("one", viewPanel => new View(viewPanel));

    workspace.openView("empty", panel, { activate: true, title: "Empty" });
    workspace.openView("one", panel, { activate: true, title: "One" });

    expect(panel.getViews().map(view => view.viewType)).toEqual(["one"]);
    expect(workspace.activeView?.viewTypeId).toBe("one");
  });

  test("restores duplicate view types by index without ambiguity", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("dup", viewPanel => new View(viewPanel));

    workspace.openView("dup", panel, { activate: false, title: "First" });
    workspace.openView("dup", panel, { activate: true, title: "Second" });

    const serialized = workspace.serializeLayout();
    const childPanel = serialized.rootPanel.children?.[0]?.panel;
    expect(childPanel?.visibleViewIndex).toBe(1);
    expect(serialized.activeViewPanelPath).toEqual([0]);
    expect(serialized.activeViewIndex).toBe(1);

    const restored = workspace.restoreLayout(serialized);
    expect(restored).toBe(true);
    expect(workspace.activeView?.viewTypeId).toBe("dup");
    expect(workspace.activeView?.title).toBe("Second");
  });
});

describe("Workspace drag-drop and split behavior", () => {
  test("computes tab insert index from pointer position", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("one", viewPanel => new View(viewPanel));
    workspace.registerView("two", viewPanel => new View(viewPanel));
    workspace.registerView("three", viewPanel => new View(viewPanel));

    workspace.openView("one", panel, { activate: false, title: "One" });
    workspace.openView("two", panel, { activate: false, title: "Two" });
    workspace.openView("three", panel, { activate: false, title: "Three" });

    const secondTabButton = panel.views[1]?.tabButton;
    expect(secondTabButton).toBeDefined();

    Object.defineProperty(secondTabButton!, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          left: 100,
          top: 0,
          right: 200,
          bottom: 30,
          width: 100,
          height: 30,
          x: 100,
          y: 0,
          toJSON: () => "",
        }) as DOMRect,
    });

    expect(panel.getInsertIndexForPointer(secondTabButton!, 120)).toBe(1);
    expect(panel.getInsertIndexForPointer(secondTabButton!, 180)).toBe(2);
  });

  test("reorders to after hovered tab using computed insert index", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("TabGroup");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("one", viewPanel => new View(viewPanel));
    workspace.registerView("two", viewPanel => new View(viewPanel));
    workspace.registerView("three", viewPanel => new View(viewPanel));

    workspace.openView("one", panel, { activate: false, title: "One" });
    workspace.openView("two", panel, { activate: false, title: "Two" });
    workspace.openView("three", panel, { activate: false, title: "Three" });

    const moved = workspace.applyDropIntent({
      kind: "reorder",
      sourcePanelId: panel.id,
      sourceTabId: panel.views[0].tabId,
      targetPanelId: panel.id,
      targetIndex: 2,
    });

    expect(moved).toBe(true);
    expect(panel.views.map(view => view.viewType)).toEqual(["two", "one", "three"]);
  });

  test("maps split axis to css classes expected by workspace styles", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("SplitGroup", "row");

    expect(panel.contentEl.classList.contains("horizontal")).toBe(true);
    expect(panel.contentEl.classList.contains("vertical")).toBe(false);

    panel.setSplitAxis("column", false);

    expect(panel.contentEl.classList.contains("horizontal")).toBe(false);
    expect(panel.contentEl.classList.contains("vertical")).toBe(true);
  });

  test("preserves persistent flag when collapsing split group with one child", () => {
    const workspace = new Workspace();
    const root = workspace.rootPanel;

    // Keep root as a split container so collapsing happens at one level only.
    const sibling = workspace.createPanel("TabGroup", "row");
    root.addPanel(sibling, 1);

    const collapsing = workspace.createPanel("SplitGroup", "row");
    collapsing.setPersistent(true);
    root.addPanel(collapsing, 1);

    const onlyChild = workspace.createPanel("TabGroup", "row");
    collapsing.addPanel(onlyChild, 1);

    workspace.normalizeLayout(collapsing);

    const replaced = root.childPanels[1]?.panel;
    expect(replaced).toBe(onlyChild);
    expect(replaced?.isPersistent()).toBe(true);
  });
});
