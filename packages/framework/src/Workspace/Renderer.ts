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

  private isMaximized = van.state(false);

  constructor(
    private readonly dragController: WorkspaceDragController,
    private readonly workspace: LayoutController,
    private readonly onMobileSettle: (offset: number) => void,
    private readonly windowControls?: PlatformWindowControls,
  ) {
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

  private closePanelTab(panel: ViewContainer, index: number): void {
    if (panel.activeIndex.val > index) panel.activeIndex.val--;
    panel.children.val = panel.children.val.filter((_, i) => i !== index);
    this.workspace.sanitizePanel();
    this.workspace.focusActiveView();
  }

  private syncActivePathForFocusedElement(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) return;
    const containerEl = target.closest(".view-container") as ViewContainerElement | null;
    if (!containerEl?.__workspacePanel) return;

    let panel: Panel | undefined = containerEl.__workspacePanel;
    while (panel?.parent) {
      panel.parent.activeIndex.val = panel.parent.children.val.indexOf(panel);
      panel = panel.parent;
    }
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
        onfocusin: (e: FocusEvent) => this.syncActivePathForFocusedElement(e.target),
        ...mobileDragController({ onSettle: this.onMobileSettle }),
      },
      this.renderPanel(workspace.rootPanel, true, true),
      this.renderFloatingViews(workspace.floatingViews),
      div({ class: "drag-indicator", style: this.dragController.indicatorStyle }),
    );
  }

  renderPanel(panel: Panel, istop: boolean, isright: boolean): HTMLElement | (() => HTMLElement) {
    if (panel.type === "view") {
      const panelEl = div(
        {
          class: "view-container",
          style: () => `flex: ${panel.size.val};`,
        },
        () =>
          div(
            {
              class: istop ? "tabs draggable-region" : "tabs",
              onpointerdown: (e: PointerEvent) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;

                const targetEl = e.target as HTMLElement | null;
                if (!targetEl) return;

                const closeBtn = targetEl.closest<HTMLElement>("[data-close-index]");
                if (closeBtn) {
                  const closeIndex = Number(closeBtn.dataset.closeIndex);
                  if (Number.isInteger(closeIndex)) this.closePanelTab(panel, closeIndex);
                  return;
                }

                const tabEl = targetEl.closest<HTMLElement>("[data-tab-index]");
                if (!tabEl) return;

                const index = Number(tabEl.dataset.tabIndex);
                if (!Number.isInteger(index)) return;

                const view = panel.children.val[index];
                if (!view) return;

                panel.activeIndex.val = index;
                this.workspace.focusActiveView();
                this.dragController.startTabDrag(view, panel, e);
              },
              onauxclick: (e: MouseEvent) => {
                if (e.button !== 1) return;
                const targetEl = e.target as HTMLElement | null;
                const tabEl = targetEl?.closest<HTMLElement>("[data-tab-index]");
                if (!tabEl) return;

                const index = Number(tabEl.dataset.tabIndex);
                if (!Number.isInteger(index)) return;

                e.preventDefault();
                this.closePanelTab(panel, index);
              },
            },
            panel.children.val.map((view, index) =>
              div(
                {
                  class: () => `tab ${index === panel.activeIndex.val ? "active" : ""}`,
                  "data-tab-index": String(index),
                },
                () => (view.val.icon.val ? renderIcon(view.val.icon.val) : null),
                span({ class: "label" }, view.val.title),
                span(
                  {
                    class: "close-btn",
                    "data-close-index": String(index),
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
        },
        ...panel.children.val.flatMap((child, index) => {
          const elements = [
            this.renderPanel(
              child,
              (istop && panel.direction === "horizontal") || index === 0,
              isright &&
                (panel.direction === "horizontal" ? index === panel.children.val.length - 1 : index === 0),
            ),
          ];

          if (index < panel.children.val.length - 1) {
            elements.push(
              div({
                class: `panel-divider ${panel.direction}`,
                onpointerdown: (e: PointerEvent) => this.dragController.startDragResize(panel, index, e),
              }),
            );
          }

          return elements;
        }),
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
