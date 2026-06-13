export * from "./Interactions";
export * from "./State";
export * from "./Types";
import apocalypseThrottle from "apocalypse-throttle";
import van from "vanjs-core";
import { App } from "../App";
import { WorkspaceDragController } from "./Interactions";
import { EmptyView, WorkspaceRenderer } from "./Renderer";
import { LayoutController } from "./State";
import { PanelContainer, PanelContainerSerialized, PanelSerialized } from "./Types";
import "./Workspace.css";

const WORKSPACE_CONFIG_NAME = "workspace";
const AUTO_SAVE_DELAY_MS = 500;

export class Workspace {
  layoutController: LayoutController;
  dragController: WorkspaceDragController;
  renderer: WorkspaceRenderer;
  private readonly handleWindowKeyDown = (event: KeyboardEvent): void =>
    this.layoutController.activeView.val?.handleKeyDown?.(
      event,
      (event.metaKey ? "Meta+" : "") +
        (event.ctrlKey ? "Ctrl+" : "") +
        (event.altKey ? "Alt+" : "") +
        (event.shiftKey ? "Shift+" : "") +
        event.key,
    );

  constructor(
    private parentEl: HTMLElement = document.body,
    layout: PanelContainerSerialized,
    public app: App,
  ) {
    this.layoutController = new LayoutController(layout);
    this.dragController = new WorkspaceDragController(this.layoutController);

    const onMobileSettle = (offset: number): void => {
      const rootPanel = this.layoutController.rootPanel;
      if (rootPanel.direction !== "horizontal" || rootPanel.children.val.length < 2) return;
      const len = rootPanel.children.val.length;
      if (offset >= 0.5) {
        rootPanel.activeIndex.val = 0;
      } else if (offset <= -0.5) {
        rootPanel.activeIndex.val = len - 1;
      } else {
        rootPanel.activeIndex.val = Math.floor(len / 2);
      }
      void this.layoutController.focusActiveView();
    };

    this.renderer = new WorkspaceRenderer(
      this.dragController,
      this.layoutController,
      onMobileSettle,
      app.platformBridge.windowControls,
    );

    this.layoutController.registerView("empty-view", () => new EmptyView(this.layoutController));

    window.addEventListener("keydown", this.handleWindowKeyDown);
    this.layoutController.sanitizePanel();

    this.init();

    this.layoutController.focusActiveView();
  }

  saveConfig = apocalypseThrottle(
    (serialized: PanelSerialized) =>
      this.app.files.saveConfig(WORKSPACE_CONFIG_NAME, JSON.stringify(serialized)),
    AUTO_SAVE_DELAY_MS,
  );

  async init() {
    try {
      const parsed = JSON.parse(await this.app.files.loadConfig(WORKSPACE_CONFIG_NAME)) as unknown;
      if (this.layoutController.validateSerializedPanel(parsed)) {
        const panel = this.layoutController.deserializePanel(parsed) as PanelContainer;
        this.layoutController.rootPanel.type = panel.type;
        this.layoutController.rootPanel.direction = panel.direction;
        this.layoutController.rootPanel.children.val = panel.children.val;
        this.layoutController.rootPanel.activeIndex.val = panel.activeIndex.val;
        this.layoutController.rootPanel.size.val = panel.size.val;
      }
    } catch {
      // Keep the constructor-provided default layout when persisted config is invalid.
    }

    this.renderer.mount(this.parentEl, {
      rootPanel: this.layoutController.rootPanel,
      floatingViews: this.layoutController.floatingViews,
    });

    van.derive(() => this.saveConfig(this.layoutController.serializePanel(this.layoutController.rootPanel)));
  }
}
