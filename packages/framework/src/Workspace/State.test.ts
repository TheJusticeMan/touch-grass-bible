import { describe, expect, test } from "vitest";
import van from "vanjs-core";
import { LayoutController, View, viewStateController } from "./State";
import type { PanelContainerSerialized } from "./Types";

// ---------------------------------------------------------------------------
// viewStateController
// ---------------------------------------------------------------------------

type SimpleState = { count: number; label: string };

function makeController(initial: SimpleState = { count: 0, label: "hello" }) {
  return new viewStateController<SimpleState>(initial);
}

describe("viewStateController - initial state", () => {
  test("state properties are reactive (van.State)", () => {
    const ctrl = makeController();
    expect(ctrl.state.count.val).toBe(0);
    expect(ctrl.state.label.val).toBe("hello");
  });

  test("getState returns a plain snapshot of current values", () => {
    const ctrl = makeController({ count: 7, label: "world" });
    expect(ctrl.getState()).toEqual({ count: 7, label: "world" });
  });

  test("history starts empty", () => {
    const ctrl = makeController();
    expect(ctrl.history).toHaveLength(0);
  });
});

describe("viewStateController - updateViewState", () => {
  test("partial update only changes specified keys", () => {
    const ctrl = makeController({ count: 1, label: "a" });
    ctrl.updateViewState({ count: 99 }, false);
    expect(ctrl.state.count.val).toBe(99);
    expect(ctrl.state.label.val).toBe("a");
  });

  test("with save=true (default) appends one history entry", () => {
    const ctrl = makeController();
    ctrl.updateViewState({ count: 5 });
    expect(ctrl.history).toHaveLength(1);
    expect(ctrl.history[0].state.count).toBe(5);
  });

  test("with save=false does NOT append history", () => {
    const ctrl = makeController();
    ctrl.updateViewState({ count: 5 }, false);
    expect(ctrl.history).toHaveLength(0);
  });

  test("returns this for chaining", () => {
    const ctrl = makeController();
    expect(ctrl.updateViewState({}, false)).toBe(ctrl);
  });

  test("ignores keys that don't exist in the initial state", () => {
    const ctrl = makeController();
    // TypeScript would catch this, but let's verify it doesn't throw at runtime
    expect(() =>
      ctrl.updateViewState({ nonExistent: 42 } as unknown as Partial<SimpleState>, false),
    ).not.toThrow();
    expect(ctrl.state.count.val).toBe(0);
  });
});

describe("viewStateController - saveState", () => {
  test("captures a snapshot of all current values", () => {
    const ctrl = makeController({ count: 3, label: "snap" });
    ctrl.saveState();
    expect(ctrl.history[0].state).toEqual({ count: 3, label: "snap" });
  });

  test("multiple saves stack in order", () => {
    const ctrl = makeController();
    ctrl.updateViewState({ count: 1 }, false);
    ctrl.saveState();
    ctrl.updateViewState({ count: 2 }, false);
    ctrl.saveState();
    expect(ctrl.history).toHaveLength(2);
    expect(ctrl.history[0].state.count).toBe(1);
    expect(ctrl.history[1].state.count).toBe(2);
  });

  test("returns this for chaining", () => {
    const ctrl = makeController();
    expect(ctrl.saveState()).toBe(ctrl);
  });
});

describe("viewStateController - undo", () => {
  test("returns false and leaves state unchanged when history is empty", () => {
    const ctrl = makeController({ count: 10, label: "x" });
    const result = ctrl.undo();
    expect(result).toBe(false);
    expect(ctrl.state.count.val).toBe(10);
  });

  test("returns false when history has only one entry (current is discarded, no previous)", () => {
    const ctrl = makeController({ count: 5, label: "x" });
    ctrl.saveState();
    const result = ctrl.undo();
    expect(result).toBe(false);
  });

  test("restores the previous state and returns true", () => {
    const ctrl = makeController({ count: 1, label: "first" });
    ctrl.saveState(); // save state A: { count:1, label:"first" }
    ctrl.updateViewState({ count: 2, label: "second" }, false);
    ctrl.saveState(); // save state B: { count:2, label:"second" }

    const result = ctrl.undo();
    expect(result).toBe(true);
    expect(ctrl.state.count.val).toBe(1);
    expect(ctrl.state.label.val).toBe("first");
  });

  test("consumes two history entries per call (discard current, restore previous)", () => {
    const ctrl = makeController({ count: 0, label: "" });
    ctrl.saveState(); // [0]
    ctrl.updateViewState({ count: 1 }, false);
    ctrl.saveState(); // [0, 1]
    ctrl.updateViewState({ count: 2 }, false);
    ctrl.saveState(); // [0, 1, 2]

    ctrl.undo(); // discards 2, restores 1, history=[0]
    expect(ctrl.history).toHaveLength(1);
    expect(ctrl.state.count.val).toBe(1);
  });

  test("undo of undo continues stepping back through history", () => {
    const ctrl = makeController({ count: 0, label: "" });
    ctrl.saveState();
    ctrl.updateViewState({ count: 10 }, false);
    ctrl.saveState();
    ctrl.updateViewState({ count: 20 }, false);
    ctrl.saveState();

    ctrl.undo(); // -> count=10, history=[{count:0}]
    ctrl.saveState(); // re-save restored state
    ctrl.undo(); // -> count=0
    expect(ctrl.state.count.val).toBe(0);
  });

  test("restores tracked atom states", () => {
    const ctrl = makeController();
    const atom = ctrl.useState(100);

    ctrl.saveState(); // save with atom=100
    atom.val = 200;
    ctrl.saveState(); // save with atom=200

    ctrl.undo();
    expect(atom.val).toBe(100);
  });
});

describe("viewStateController - useState / atoms", () => {
  test("useState creates a reactive atom included in saveState snapshots", () => {
    const ctrl = makeController();
    const atom = ctrl.useState("initial");
    ctrl.saveState();
    atom.val = "changed";
    ctrl.saveState();
    ctrl.undo();
    expect(atom.val).toBe("initial");
  });

  test("getAtoms returns all atoms created via useState", () => {
    const ctrl = makeController();
    const a1 = ctrl.useState(1);
    const a2 = ctrl.useState(2);
    const atoms = ctrl.getAtoms();
    expect(atoms.has(a1 as ReturnType<typeof van.state>)).toBe(true);
    expect(atoms.has(a2 as ReturnType<typeof van.state>)).toBe(true);
  });

  test("copyAtomsFrom merges atoms from another controller", () => {
    const ctrl1 = makeController();
    const atom = ctrl1.useState(42);

    const ctrl2 = makeController();
    ctrl2.copyAtomsFrom(ctrl1 as unknown as viewStateController<Record<string, unknown>>);

    expect(ctrl2.getAtoms().has(atom as ReturnType<typeof van.state>)).toBe(true);
  });
});

describe("viewStateController - clearStateHistory", () => {
  test("removes all history entries and returns this", () => {
    const ctrl = makeController();
    ctrl.saveState();
    ctrl.saveState();
    ctrl.saveState();
    expect(ctrl.clearStateHistory()).toBe(ctrl);
    expect(ctrl.history).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LayoutController - validateSerializedPanel
// ---------------------------------------------------------------------------

const MINIMAL_LAYOUT: PanelContainerSerialized = {
  type: "panel",
  direction: "horizontal",
  activeIndex: 0,
  size: 1,
  children: [],
};

function makeLayout(overrides: Partial<PanelContainerSerialized> = {}): LayoutController {
  return new LayoutController({ ...MINIMAL_LAYOUT, ...overrides });
}

describe("LayoutController - validateSerializedPanel", () => {
  test("accepts a minimal valid panel container", () => {
    const lc = makeLayout();
    expect(lc.validateSerializedPanel(MINIMAL_LAYOUT)).toBe(true);
  });

  test("accepts a valid view container", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({
        type: "view",
        activeIndex: 0,
        size: 1,
        children: [{ viewType: "my-view", title: "My View", state: "" }],
      }),
    ).toBe(true);
  });

  test("accepts a valid panel container with nested children", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({
        type: "panel",
        direction: "vertical",
        activeIndex: 0,
        size: 1,
        children: [
          { type: "view", activeIndex: 0, size: 0.5, children: [] },
          { type: "view", activeIndex: 0, size: 0.5, children: [] },
        ],
      }),
    ).toBe(true);
  });

  test("rejects non-object input", () => {
    const lc = makeLayout();
    expect(lc.validateSerializedPanel(null)).toBe(false);
    expect(lc.validateSerializedPanel(undefined)).toBe(false);
    expect(lc.validateSerializedPanel("string")).toBe(false);
    expect(lc.validateSerializedPanel(42)).toBe(false);
  });

  test("rejects unknown type", () => {
    const lc = makeLayout();
    expect(lc.validateSerializedPanel({ type: "unknown", activeIndex: 0, size: 1 })).toBe(false);
  });

  test("rejects panel with negative activeIndex", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({ type: "panel", direction: "horizontal", activeIndex: -1, size: 1 }),
    ).toBe(false);
  });

  test("rejects panel with non-finite size", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({ type: "panel", direction: "horizontal", activeIndex: 0, size: Infinity }),
    ).toBe(false);
  });

  test("rejects panel with invalid direction", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({ type: "panel", direction: "diagonal", activeIndex: 0, size: 1 }),
    ).toBe(false);
  });

  test("rejects view with malformed viewInfo entry", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({
        type: "view",
        activeIndex: 0,
        size: 1,
        children: [{ viewType: "my-view" /* missing title and state */ }],
      }),
    ).toBe(false);
  });

  test("rejects view with non-string viewType", () => {
    const lc = makeLayout();
    expect(
      lc.validateSerializedPanel({
        type: "view",
        activeIndex: 0,
        size: 1,
        children: [{ viewType: 123, title: "ok", state: "" }],
      }),
    ).toBe(false);
  });
});

describe("LayoutController - registerView / unregisterView", () => {
  test("registered views appear in registeredViews state", () => {
    const lc = makeLayout();
    const factory = () => ({ viewTypeId: "test", title: van.state("Test") }) as never;
    lc.registerView("my-view", factory);
    const ids = lc.registeredViews.val.map(([id]) => id);
    expect(ids).toContain("my-view");
  });

  test("unregistered views are removed from registeredViews state", () => {
    const lc = makeLayout();
    const factory = () => ({ viewTypeId: "test", title: van.state("Test") }) as never;
    lc.registerView("my-view", factory);
    lc.unregisterView("my-view");
    const ids = lc.registeredViews.val.map(([id]) => id);
    expect(ids).not.toContain("my-view");
  });
});

class SingletonTestView extends View {
  readonly viewTypeId = "singleton-test-view";
  isSingleton = true;

  constructor() {
    super("Singleton Test View", {});
  }

  create(): HTMLElement {
    return {} as HTMLElement;
  }
}

function countViewsByType(panel: ReturnType<LayoutController["deserializePanel"]>, viewTypeId: string): number {
  if (panel.type === "view") {
    return panel.children.val.filter(v => v.val.viewTypeId === viewTypeId).length;
  }
  return panel.children.val.reduce((total, child) => total + countViewsByType(child, viewTypeId), 0);
}

describe("LayoutController - singleton view uniqueness", () => {
  test("addViewToPanel reuses an existing singleton instead of adding duplicates", () => {
    const lc = makeLayout();
    lc.registerView("singleton-test-view", () => new SingletonTestView());

    const first = lc.addViewToPanel("singleton-test-view");
    const second = lc.addViewToPanel("singleton-test-view");

    expect(second).toBe(first);
    expect(countViewsByType(lc.rootPanel.val, "singleton-test-view")).toBe(1);
  });

  test("replaceViewInPanel reuses existing singleton instead of creating another", () => {
    const lc = makeLayout({
      children: [{ type: "view", activeIndex: 0, size: 1, children: [] }],
    });
    lc.registerView("singleton-test-view", () => new SingletonTestView());

    const first = lc.addViewToPanel("singleton-test-view");
    const hostPanel = lc.rootPanel.val.children.val[0];
    const empty = lc.addViewToPanel("empty-view", hostPanel);

    lc.replaceViewInPanel(empty, "singleton-test-view");

    expect(countViewsByType(lc.rootPanel.val, "singleton-test-view")).toBe(1);
    expect(lc.findViewByType("singleton-test-view")).toBe(first);
  });
});
