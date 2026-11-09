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

/**
 * Workspace manages the main layout, rendering, and state of the application's panel-based UI system.
 *
 * The Workspace class is responsible for:
 * - Managing the layout hierarchy through {@link LayoutController}
 * - Rendering the UI using {@link WorkspaceRenderer}
 * - Handling keyboard interactions and focus management
 * - Persisting and loading workspace configuration
 * - Coordinating drag operations through {@link WorkspaceDragController}
 * - Auto-saving layout changes with throttling
 *
 * @example
 * ```typescript
 * const workspace = new Workspace(
 *   document.getElementById('app'),
 *   initialLayout,
 *   app
 * );
 * ```
 *
 * @remarks
 * The workspace automatically:
 * - Listens for keyboard events and delegates them to the active view
 * - Throttles save operations to avoid excessive persistence writes
 * - Validates and restores persisted layout configurations on initialization
 * - Handles mobile settling behavior for horizontal panel navigation
 * - Registers the empty view as a default view type
 *
 * @property {LayoutController} layout - Controls the panel layout hierarchy and active view state
 * @property {WorkspaceRenderer} renderer - Handles rendering of the workspace UI
 * @property {App} app - Reference to the main application instance for file and platform access
 */
export class Workspace {
  layout: LayoutController;
  renderer: WorkspaceRenderer;
  private readonly handleWindowKeyDown = (event: KeyboardEvent): void =>
    this.layout.activeView.val?.handleKeyDown?.(
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
    this.layout = new LayoutController(layout);

    const onMobileSettle = (offset: number): void => {
      const rootPanel = this.layout.rootPanel.val;
      if (rootPanel.direction !== "horizontal" || rootPanel.children.val.length < 2) return;
      const len = rootPanel.children.val.length;
      if (offset >= 0.5) {
        rootPanel.activeIndex.val = 0;
      } else if (offset <= -0.5) {
        rootPanel.activeIndex.val = len - 1;
      } else {
        rootPanel.activeIndex.val = Math.floor(len / 2);
      }
      void this.layout.focusActiveView();
    };

    this.renderer = new WorkspaceRenderer(
      new WorkspaceDragController(this.layout),
      this.layout,
      onMobileSettle,
      app.platformBridge.windowControls,
    );

    this.layout.registerView("empty-view", () => new EmptyView(this.layout));

    window.addEventListener("keydown", this.handleWindowKeyDown);
    this.layout.sanitizePanel();

    this.init();

    this.layout.focusActiveView();
  }

  saveConfig = apocalypseThrottle(
    (serialized: PanelSerialized) =>
      this.app.files.saveConfig(WORKSPACE_CONFIG_NAME, JSON.stringify(serialized)),
    AUTO_SAVE_DELAY_MS,
  );

  async init() {
    try {
      const parsed = JSON.parse(await this.app.files.loadConfig(WORKSPACE_CONFIG_NAME));
      if (this.layout.validateSerializedPanel(parsed)) {
        this.layout.rootPanel.val = this.layout.deserializePanel(parsed) as PanelContainer;
      }
    } catch {
      // Keep the constructor-provided default layout when persisted config is invalid.
    }

    this.renderer.mount(this.parentEl, {
      rootPanel: this.layout.rootPanel.val,
      floatingViews: this.layout.floatingViews,
    });

    van.derive(() => this.saveConfig(this.layout.serializePanel(this.layout.rootPanel.val)));
  }
}
