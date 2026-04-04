import { describe, test, expect } from "vitest";
import { WorkspaceLayoutModel } from "./WorkspaceLayoutModel";
import type { WorkspaceLayout, SerializedPanel } from "./Workspace";

// ---------------------------------------------------------------------------
// Helpers for building minimal valid layouts
// ---------------------------------------------------------------------------

function tabPanel(id: string, views: Array<{ viewType: string; title: string }> = []): SerializedPanel {
  return { id, splitAxis: "row", mode: "TabGroup", views };
}

function splitPanel(
  id: string,
  children: Array<{ size: number; panel: SerializedPanel }>,
  splitAxis: "row" | "column" = "row",
): SerializedPanel {
  return { id, splitAxis, mode: "SplitGroup", children };
}

function validLayout(root: SerializedPanel): WorkspaceLayout {
  return { version: 2, rootPanel: root };
}

// ---------------------------------------------------------------------------
// isValidLayout
// ---------------------------------------------------------------------------

describe("WorkspaceLayoutModel.isValidLayout", () => {
  test("accepts a minimal valid TabGroup layout", () => {
    const layout = validLayout(tabPanel("root"));
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(true);
  });

  test("rejects null / undefined", () => {
    expect(WorkspaceLayoutModel.isValidLayout(null as unknown as WorkspaceLayout)).toBe(false);
    expect(WorkspaceLayoutModel.isValidLayout(undefined as unknown as WorkspaceLayout)).toBe(false);
  });

  test("rejects wrong version", () => {
    const layout = { version: 1, rootPanel: tabPanel("root") } as unknown as WorkspaceLayout;
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(false);
  });

  test("rejects missing rootPanel", () => {
    const layout = { version: 2 } as unknown as WorkspaceLayout;
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(false);
  });

  test("rejects non-array activeViewPanelPath", () => {
    const layout: WorkspaceLayout = {
      version: 2,
      rootPanel: tabPanel("root"),
      activeViewPanelPath: 5 as unknown as number[],
    };
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(false);
  });

  test("rejects negative integer in activeViewPanelPath", () => {
    const layout: WorkspaceLayout = {
      version: 2,
      rootPanel: tabPanel("root"),
      activeViewPanelPath: [-1],
    };
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(false);
  });

  test("accepts valid activeViewPanelPath", () => {
    const layout: WorkspaceLayout = {
      version: 2,
      rootPanel: tabPanel("root"),
      activeViewPanelPath: [0, 1],
    };
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(true);
  });

  test("rejects negative activeViewIndex", () => {
    const layout: WorkspaceLayout = {
      version: 2,
      rootPanel: tabPanel("root"),
      activeViewIndex: -1,
    };
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(false);
  });

  test("rejects non-integer activeViewIndex", () => {
    const layout: WorkspaceLayout = {
      version: 2,
      rootPanel: tabPanel("root"),
      activeViewIndex: 1.5,
    };
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(false);
  });

  test("accepts zero activeViewIndex", () => {
    const layout: WorkspaceLayout = {
      version: 2,
      rootPanel: tabPanel("root"),
      activeViewIndex: 0,
    };
    expect(WorkspaceLayoutModel.isValidLayout(layout)).toBe(true);
  });

  test("rejects panel with invalid mode", () => {
    const panel = { id: "root", splitAxis: "row", mode: "Unknown" } as unknown as SerializedPanel;
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("rejects panel without id", () => {
    const panel = { id: "", splitAxis: "row", mode: "TabGroup" } as unknown as SerializedPanel;
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("rejects TabGroup panel with non-boolean persistent", () => {
    const panel: SerializedPanel = {
      id: "root",
      splitAxis: "row",
      mode: "TabGroup",
      persistent: "yes" as unknown as boolean,
    };
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("rejects TabGroup panel with children", () => {
    const child = tabPanel("child");
    const panel: SerializedPanel = {
      id: "root",
      splitAxis: "row",
      mode: "TabGroup",
      children: [{ size: 1, panel: child }],
    };
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("rejects TabGroup panel with invalid visibleViewIndex", () => {
    const panel: SerializedPanel = {
      id: "root",
      splitAxis: "row",
      mode: "TabGroup",
      visibleViewIndex: -1,
    };
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("rejects TabGroup views without required fields", () => {
    const panel: SerializedPanel = {
      id: "root",
      splitAxis: "row",
      mode: "TabGroup",
      views: [{ viewType: "", title: "T" }],
    };
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("accepts TabGroup with valid views", () => {
    const panel: SerializedPanel = {
      id: "root",
      splitAxis: "row",
      mode: "TabGroup",
      views: [{ viewType: "bible", title: "Bible" }],
    };
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(true);
  });

  test("rejects SplitGroup with views", () => {
    const panel: SerializedPanel = {
      id: "root",
      splitAxis: "row",
      mode: "SplitGroup",
      views: [{ viewType: "bible", title: "Bible" }],
      children: [],
    };
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("rejects SplitGroup child with zero size", () => {
    const child = tabPanel("child");
    const panel = splitPanel("root", [{ size: 0, panel: child }]);
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(panel))).toBe(false);
  });

  test("accepts a valid nested SplitGroup layout", () => {
    const left = tabPanel("left", [{ viewType: "bible", title: "Bible" }]);
    const right = tabPanel("right", [{ viewType: "notes", title: "Notes" }]);
    const root = splitPanel("root", [
      { size: 50, panel: left },
      { size: 50, panel: right },
    ]);
    expect(WorkspaceLayoutModel.isValidLayout(validLayout(root))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasView
// ---------------------------------------------------------------------------

describe("WorkspaceLayoutModel.hasView", () => {
  test("returns true when viewType exists in a TabGroup", () => {
    const panel = tabPanel("root", [{ viewType: "bible", title: "Bible" }]);
    expect(WorkspaceLayoutModel.hasView(validLayout(panel), "bible")).toBe(true);
  });

  test("returns false when viewType does not exist", () => {
    const panel = tabPanel("root", [{ viewType: "bible", title: "Bible" }]);
    expect(WorkspaceLayoutModel.hasView(validLayout(panel), "journal")).toBe(false);
  });

  test("returns true when viewType exists in a nested child", () => {
    const child = tabPanel("child", [{ viewType: "search", title: "Search" }]);
    const root = splitPanel("root", [{ size: 100, panel: child }]);
    expect(WorkspaceLayoutModel.hasView(validLayout(root), "search")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// collectViewIds
// ---------------------------------------------------------------------------

describe("WorkspaceLayoutModel.collectViewIds", () => {
  test("returns empty array for TabGroup with no views", () => {
    expect(WorkspaceLayoutModel.collectViewIds(validLayout(tabPanel("root")))).toEqual([]);
  });

  test("collects viewType values from all TabGroup panels", () => {
    const left = tabPanel("l", [{ viewType: "bible", title: "Bible" }]);
    const right = tabPanel("r", [
      { viewType: "notes", title: "Notes" },
      { viewType: "search", title: "Search" },
    ]);
    const root = splitPanel("root", [
      { size: 50, panel: left },
      { size: 50, panel: right },
    ]);
    const ids = WorkspaceLayoutModel.collectViewIds(validLayout(root));
    expect(ids).toEqual(expect.arrayContaining(["bible", "notes", "search"]));
    expect(ids).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

describe("WorkspaceLayoutModel.walk", () => {
  test("visits a single TabGroup panel once", () => {
    const panel = tabPanel("root");
    const visited: string[] = [];
    WorkspaceLayoutModel.walk(panel, p => visited.push(p.id));
    expect(visited).toEqual(["root"]);
  });

  test("visits root and all nested panels in a SplitGroup", () => {
    const child1 = tabPanel("c1");
    const child2 = tabPanel("c2");
    const root = splitPanel("root", [
      { size: 50, panel: child1 },
      { size: 50, panel: child2 },
    ]);
    const visited: string[] = [];
    WorkspaceLayoutModel.walk(root, p => visited.push(p.id));
    expect(visited).toContain("root");
    expect(visited).toContain("c1");
    expect(visited).toContain("c2");
    expect(visited).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// normalizeMode
// ---------------------------------------------------------------------------

describe("WorkspaceLayoutModel.normalizeMode", () => {
  test("returns SplitGroup for SplitGroup panels", () => {
    const panel = splitPanel("root", []);
    expect(WorkspaceLayoutModel.normalizeMode(panel)).toBe("SplitGroup");
  });

  test("returns TabGroup for TabGroup panels", () => {
    const panel = tabPanel("root");
    expect(WorkspaceLayoutModel.normalizeMode(panel)).toBe("TabGroup");
  });

  test("returns TabGroup for unknown modes", () => {
    const panel = { id: "x", splitAxis: "row", mode: "weird" } as unknown as SerializedPanel;
    expect(WorkspaceLayoutModel.normalizeMode(panel)).toBe("TabGroup");
  });
});
