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

describe("Workspace active view tracking", () => {
  test("hydrates unresolved active view and tracks it by type", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("views");
    workspace.rootPanel.addPanel(panel);

    workspace.openView("verse-screen", panel, { activate: true, title: "Verse" });
    expect(workspace.getActiveViewOfType("verse-screen")).toBeNull();

    workspace.registerView("verse-screen", hydratedPanel => new View(hydratedPanel));

    const tracked = workspace.getActiveViewOfType("verse-screen");
    expect(tracked).not.toBeNull();
    expect(tracked?.viewTypeId).toBe("verse-screen");
    expect(workspace.activeView).toBe(tracked);
  });

  test("restores active view by stable view id and keeps type tracking", () => {
    const workspace = new Workspace();
    const panel = workspace.createPanel("views");
    workspace.rootPanel.addPanel(panel);

    workspace.registerView("one", viewPanel => new View(viewPanel));
    workspace.registerView("two", viewPanel => new View(viewPanel));

    workspace.openView("one", panel, { activate: false, title: "One" });
    workspace.openView("two", panel, { activate: true, title: "Two" });

    const serialized = workspace.serializeLayout();
    const restored = workspace.restoreLayout(serialized);

    expect(restored).toBe(true);
    expect(workspace.activeView?.viewTypeId).toBe("two");
    expect(workspace.getActiveViewOfType("two")).not.toBeNull();
  });
});
