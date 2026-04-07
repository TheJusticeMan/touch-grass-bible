import { createElement, IconNode, X } from "lucide";
import { Menu, UIComponent } from "../UIComponents";
import type { NodeType, SplitAxis } from "./Workspace";

export class WorkspaceTabButton extends UIComponent<"button"> {
  private iconEl: HTMLSpanElement;
  private labelEl: HTMLSpanElement;
  private closeEl: HTMLSpanElement;
  private closeIconEl: HTMLSpanElement;

  constructor(
    tabId: string,
    title: string,
    private onClick: () => void,
    unresolved: boolean = false,
    onPointerDown?: (event: PointerEvent) => void,
    private onClose?: () => void,
    private onMenu?: (event: Menu) => void,
    icon: IconNode | null = null,
  ) {
    super(null, "button", { detached: true });
    this.setAttr("type", "button").addClass("panel-tab").setData({ viewId: tabId });
    this.iconEl = this.createChild("span", { cls: "panel-tab-icon" });
    this.labelEl = this.createChild("span", { cls: "panel-tab-label" });
    this.closeEl = this.createChild("span", { cls: "panel-tab-close", attr: { role: "button" } });
    this.closeEl.setAttribute("aria-label", `Close ${title}`);
    this.closeIconEl = this.closeEl.createEl("span", { cls: "panel-tab-close-icon" });
    this.closeIconEl.appendChild(createElement(X, { "stroke-width": 1.75 }));
    this.setTitle(title);
    this.setTabIcon(icon);
    this.setCloseable(!!onClose);
    this.setUnresolved(unresolved);
    this.listen("click", event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".panel-tab-close")) {
        return;
      }
      this.onClick();
    });
    this.listenOn<PointerEvent>(this.closeEl, "pointerdown", event => event.stopPropagation());
    this.listenOn<MouseEvent>(this.closeEl, "click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.onClose?.();
    });
    this.listen("auxclick", event => {
      if (event.button === 1) this.onClose?.();
    });

    this.listen("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      this.onMenu?.(menu);
      menu.showAtMouseEvent(event);
    });

    if (onPointerDown) {
      this.listen("pointerdown", event => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".panel-tab-close")) {
          return;
        }
        onPointerDown(event);
      });
    }
  }

  setTitle(title: string): this {
    this.labelEl.textContent = title;
    this.closeEl.setAttribute("aria-label", `Close ${title}`);
    return this;
  }

  setTabIcon(icon: IconNode | null): this {
    this.iconEl.replaceChildren();
    if (icon) {
      this.iconEl.appendChild(createElement(icon, { "stroke-width": 1.75 }));
    }
    this.iconEl.classList.toggle("is-hidden", !icon);
    return this;
  }

  setCloseable(closeable: boolean): this {
    this.closeEl.classList.toggle("is-hidden", !closeable);
    return this;
  }

  setActive(active: boolean): this {
    this.element.classList.toggle("is-active", active);
    return this;
  }

  setUnresolved(unresolved: boolean): this {
    this.element.classList.toggle("is-unresolved", unresolved);
    return this;
  }
}

export class WorkspacePlaceholder extends UIComponent<"div"> {
  constructor(tabId: string) {
    super(null, "div", { detached: true });
    this.addClass("view", "view-unresolved");
    this.element.dataset.viewId = tabId;
  }

  setActive(active: boolean): this {
    this.element.classList.toggle("is-active", active);
    return this;
  }
}

export class WorkspacePanelContainer extends UIComponent<"div"> {
  constructor(panelId: string) {
    super(null, "div", { detached: true });
    this.addClass("panel");
    this.addClass(panelId);
    this.element.dataset.panelId = panelId;
  }

  setMode(mode: NodeType): this {
    this.element.classList.toggle("panel-mode-views", mode === "TabGroup");
    this.element.classList.toggle("panel-mode-panels", mode === "SplitGroup");
    return this;
  }
}

export class WorkspacePanelTabs extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("panel-tabs");
  }

  setHidden(hidden: boolean): this {
    this.element.classList.toggle("is-hidden", hidden);
    return this;
  }
}

export class WorkspacePanelContent extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("panel-content");
  }

  setSplitAxis(splitAxis: SplitAxis): this {
    this.element.classList.toggle("horizontal", splitAxis === "row");
    this.element.classList.toggle("vertical", splitAxis === "column");
    return this;
  }
}

export class WorkspaceRootHost extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("workspace-root-host");
  }
}

export class WorkspaceDialogLayer extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog-layer");
  }
}

export class WorkspaceDialogFrame extends UIComponent<"div"> {
  constructor(id: string) {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog-frame");
    this.setData({ dialogId: id });
  }
}

export class WorkspaceDialogBackdrop extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog-backdrop");
  }
}

export class WorkspaceDialogContainer extends UIComponent<"div"> {
  constructor(modal: boolean) {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog");
    this.element.tabIndex = -1;
    this.setAttr("role", "dialog");
    this.setAttr("aria-modal", modal ? "true" : "false");
  }
}

export class WorkspaceDialogHeader extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog-header");
  }
}

export class WorkspaceDialogTitle extends UIComponent<"div"> {
  constructor(title: string) {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog-title");
    this.setText(title);
  }
}

export class WorkspaceDialogCloseButton extends UIComponent<"button"> {
  constructor() {
    super(null, "button", { detached: true });
    this.setAttr("type", "button");
    this.addClass("workspace-dialog-close");
    this.setAria({ label: "Close dialog" });
    this.setText("Close");
  }
}

export class WorkspaceDialogContent extends UIComponent<"div"> {
  constructor() {
    super(null, "div", { detached: true });
    this.addClass("workspace-dialog-content");
  }
}
