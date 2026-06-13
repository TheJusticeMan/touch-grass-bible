import van from "vanjs-core";
import { renderIcon } from "../Icons";
import type { PlatformWindowControls } from "../PlatformBridge";
import { Minus, Minimize2, Maximize2, X, Plus } from "lucide";
import { WorkspaceDragController, mobileDragController } from "./Interactions";
import { LayoutController, View } from "./State";
import { Panel, ViewContainer, ViewContainerElement } from "./Types";
const { div, span } = van.tags;

export class WorkspaceRenderer {
  private rootEl?: HTMLElement;
  private lastActivePanel: Panel | null = null;
  private readonly mobileDragProps: ReturnType<typeof mobileDragController>;

  private isMaximized = van.state(false);

  constructor(
    private readonly dragController: WorkspaceDragController,
    private readonly workspace: LayoutController,
    onMobileSettle: (offset: number) => void,
    private readonly windowControls?: PlatformWindowControls,
  ) {
    this.mobileDragProps = mobileDragController({ onSettle: onMobileSettle });

    if (windowControls) {
      windowControls
        .isMaximized()
        .then(v => (this.isMaximized.val = v))
        .catch(() => {});
      windowControls.onMaximizedChange(v => (this.isMaximized.val = v));
    }
  }

  private renderWindowControls(): HTMLElement {
    const wc = this.windowControls!;
    return span(
      { class: "window-controls" },
      span({ class: "window-btn minimize", onclick: () => void wc.minimize() }, renderIcon(Minus)),
      span({ class: "window-btn maximize", onclick: () => void wc.maximize() }, () =>
        renderIcon(this.isMaximized.val ? Minimize2 : Maximize2),
      ),
      span({ class: "window-btn close", onclick: () => void wc.close() }, renderIcon(X)),
    );
  }

  mount(parentEl: HTMLElement, workspace: { rootPanel: Panel; floatingViews: ViewContainer }): HTMLElement {
    this.unmount();
    this.rootEl = this.renderWorkspace(workspace);
    parentEl.appendChild(this.rootEl);

    return this.rootEl;
  }

  unmount(): void {
    this.rootEl?.remove();
    this.rootEl = undefined;
  }

  renderWorkspace(workspace: { rootPanel: Panel; floatingViews: ViewContainer }): HTMLElement {
    return div(
      {
        class: "workspace-container",
        ...this.mobileDragProps,
      },
      this.renderPanel(workspace.rootPanel, true, true),
      this.renderFloatingViews(workspace.floatingViews),
      div({ class: "drag-indicator", style: this.dragController.indicatorStyle }),
    );
  }

  renderPanel(panel: Panel, istop: boolean, isright: boolean): HTMLElement | (() => HTMLElement) {
    if (panel.type === "view") {
      const removeTab = (index: number) => {
        if (panel.activeIndex.val > index) panel.activeIndex.val--;
        panel.children.val = panel.children.val.filter((_, i) => i !== index);
        this.workspace.sanitizePanel();
        this.workspace.focusActiveView();
      };
      const panelEl = div(
        {
          class: "view-container",
          style: () => `flex: ${panel.size.val};`,
          onpointermove: (e: PointerEvent) => this.dragController.handlePanelPointerMove(panel, e),
          onpointerleave: (e: PointerEvent) => this.dragController.handlePanelPointerLeave(panel, e),
          onclick: (e: MouseEvent) => {
            if (this.lastActivePanel === panel) return;
            const focusPanel = (panel: Panel): void => {
              if (panel.parent) {
                panel.parent.activeIndex.val = panel.parent.children.val.findIndex(child => child === panel);
                focusPanel(panel.parent);
              }
            };

            focusPanel(panel);
            e.stopPropagation();
            this.workspace.focusActiveView();
            this.lastActivePanel = panel;
          },
        },
        () =>
          div(
            { class: istop ? "tabs draggable-region" : "tabs" },
            panel.children.val.map((view, index) =>
              div(
                {
                  class: () => `tab ${index === panel.activeIndex.val ? "active" : ""}`,
                  onclick: () => ((panel.activeIndex.val = index), this.workspace.focusActiveView()),
                  onpointerdown: (e: PointerEvent) => {
                    if ((e.target as HTMLElement).closest(".close-btn")) return;
                    if (e.pointerType === "mouse") e.preventDefault();
                    this.dragController.startTabDrag(view, panel, e);
                  },
                  onauxclick: (e: MouseEvent) => {
                    if (e.button === 1) {
                      e.stopPropagation();
                      removeTab(index);
                    }
                  },
                },
                () => (view.val.icon.val ? renderIcon(view.val.icon.val) : null),
                span({ class: "label" }, view.val.title),
                span(
                  {
                    class: "close-btn",
                    onclick: (e: MouseEvent) => {
                      e.stopPropagation();
                      removeTab(index);
                    },
                  },
                  renderIcon(X),
                ),
              ),
            ),
            span(
              { class: "add-btn", onclick: () => this.workspace.addViewToPanel("empty-view", panel) },
              renderIcon(Plus),
            ),
            istop && isright && this.windowControls ? this.renderWindowControls() : null,
          ),
        () =>
          div(
            { class: "views" },
            panel.children.val.map((view, index) =>
              div(
                {
                  class: () =>
                    `${panel.activeIndex.val === index ? "active" : "hidden"} ${view.val.viewTypeId}`,
                },
                () => view.val.el,
              ),
            ),
          ),
      );
      (panelEl as ViewContainerElement).__workspacePanel = panel;
      return panelEl;
    }

    return () =>
      div(
        {
          class: `panel-container ${panel.direction}`,
          style: () => `flex: ${panel.size.val};`,
          onpointerdown: (e: PointerEvent) => {
            // On mobile, pane overlays and content wrappers are usually the event target.
            // Keep strict gating for mouse, but allow touch/pen to start resize hit-testing.
            if (e.pointerType === "mouse" && e.target !== e.currentTarget) return;
            const didStartResize = this.dragController.startDragResize(panel, e);
            if (didStartResize && e.pointerType !== "mouse") e.stopPropagation();
          },
          onpointermove: (e: PointerEvent) => this.dragController.handlePanelResize(panel, e),
        },
        panel.children.val.map((child, index) =>
          this.renderPanel(
            child,
            (istop && panel.direction === "horizontal") || index === 0,
            isright &&
              (panel.direction === "horizontal" ? index === panel.children.val.length - 1 : index === 0),
          ),
        ),
      );
  }

  renderFloatingViews(floatingViews: ViewContainer): () => HTMLElement {
    const destroyFloatingView = (view: View) => this.workspace.removeViewInstance(view);
    return () =>
      div(
        { class: "floating-views-container" },
        floatingViews.children.val.map(view =>
          div(
            { class: "floating-view-wrapper" },
            () => div({ class: "backdrop", onclick: () => destroyFloatingView(view.val) }),
            () =>
              div(
                {
                  class: `floating-view ${view.val.viewTypeId}`,
                  tabindex: 0,
                  onkeyup: e => e.key === "Escape" && destroyFloatingView(view.val),
                },
                div(
                  { class: () => (view.val.title.val.length > 0 ? "title" : "title hidden") },
                  div({ class: "icon" }, () => (view.val.icon.val ? renderIcon(view.val.icon.val) : null)),
                  view.val.title,
                  div({ class: "close-btn", onclick: () => destroyFloatingView(view.val) }, renderIcon(X)),
                ),
                () => view.val.el,
              ),
          ),
        ),
      );
  }
}

export class EmptyView extends View {
  readonly viewTypeId = "empty-view";

  constructor(public workspace: LayoutController) {
    super("Empty", {});
  }

  create() {
    return div(
      { class: "empty-view-container" },
      div(
        { class: "empty-view-panel" },
        div({ class: "empty-view-title" }, "Add a view"),
        div({ class: "empty-view-subtitle" }, "Choose a registered view type."),
        () =>
          div(
            { class: "empty-view-grid" },
            this.workspace.registeredViews.val.map(([viewType]) =>
              div(
                {
                  class: "empty-view-option",
                  tabindex: 0,
                  role: "button",
                  onclick: () => this.workspace.replaceViewInPanel(this, viewType),
                  onkeyup: (e: KeyboardEvent) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    this.workspace.replaceViewInPanel(this, viewType);
                  },
                },
                () =>
                  viewType
                    .toLowerCase()
                    .replace(/[_-]/g, " ")
                    .replace(/\b\w/g, char => char.toUpperCase()),
              ),
            ),
          ),
      ),
    );
  }
}
