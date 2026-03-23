import type { NodeType, SerializedPanel, WorkspaceLayout } from "./Workspace";

export type LayoutNodeType = LayoutGroupNode | LayoutViewNode;

export type LayoutGroupNode = {
  id: string;
  mode: "SplitGroup";
  splitDirection: "row" | "column";
  persistent?: boolean;
  children: Array<{ size: number; panel: LayoutNodeType }>;
};

export type LayoutViewNode = {
  id: string;
  mode: "TabGroup";
  splitDirection: "row" | "column";
  persistent?: boolean;
  visibleViewIndex?: number;
  views: Array<{
    id: string;
    title: string;
    state?: unknown;
  }>;
};

export class WorkspaceLayoutModel {
  static isValidLayout(layout: WorkspaceLayout): boolean {
    if (!layout || layout.version !== 2 || !layout.rootPanel) {
      return false;
    }
    if (layout.activeViewPanelPath !== undefined) {
      if (!Array.isArray(layout.activeViewPanelPath)) {
        return false;
      }
      if (!layout.activeViewPanelPath.every(index => Number.isInteger(index) && index >= 0)) {
        return false;
      }
    }
    if (layout.activeViewIndex !== undefined) {
      if (!Number.isInteger(layout.activeViewIndex) || layout.activeViewIndex < 0) {
        return false;
      }
    }
    return this.isValidPanel(layout.rootPanel);
  }

  static hasView(layout: WorkspaceLayout, viewId: string): boolean {
    return this.hasViewInPanel(layout.rootPanel, viewId);
  }

  static collectViewIds(layout: WorkspaceLayout): string[] {
    const ids: string[] = [];
    this.walk(layout.rootPanel, panel => {
      if (panel.mode !== "TabGroup") {
        return;
      }
      (panel.views ?? []).forEach(view => ids.push(view.viewType));
    });
    return ids;
  }

  static walk(panel: SerializedPanel, callback: (panel: SerializedPanel) => void): void {
    callback(panel);
    if (panel.mode === "SplitGroup") {
      (panel.children ?? []).forEach(child => this.walk(child.panel, callback));
    }
  }

  static normalizeMode(panel: SerializedPanel): NodeType {
    return panel.mode === "SplitGroup" ? "SplitGroup" : "TabGroup";
  }

  private static hasViewInPanel(panel: SerializedPanel, viewId: string): boolean {
    if (panel.mode === "TabGroup") {
      return (panel.views ?? []).some(view => view.viewType === viewId);
    }
    return (panel.children ?? []).some(child => this.hasViewInPanel(child.panel, viewId));
  }

  private static isValidPanel(panel: SerializedPanel): boolean {
    if (!panel.id || (panel.mode !== "TabGroup" && panel.mode !== "SplitGroup")) {
      return false;
    }
    if (panel.persistent !== undefined && typeof panel.persistent !== "boolean") {
      return false;
    }
    if (panel.splitAxis !== "row" && panel.splitAxis !== "column") {
      return false;
    }

    if (panel.mode === "TabGroup") {
      if (panel.children && panel.children.length > 0) {
        return false;
      }
      if (
        panel.visibleViewIndex !== undefined &&
        (!Number.isInteger(panel.visibleViewIndex) || panel.visibleViewIndex < 0)
      ) {
        return false;
      }
      if (panel.views && !panel.views.every(view => !!view.viewType && !!view.title)) {
        return false;
      }
      return true;
    }

    if (panel.views && panel.views.length > 0) {
      return false;
    }

    return (panel.children ?? []).every(child => child.size > 0 && this.isValidPanel(child.panel));
  }
}
