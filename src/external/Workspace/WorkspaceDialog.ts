import { ETarget } from "../Event";
import {
  WorkspaceDialogBackdrop,
  WorkspaceDialogCloseButton,
  WorkspaceDialogContainer,
  WorkspaceDialogContent,
  WorkspaceDialogFrame,
  WorkspaceDialogHeader,
  WorkspaceDialogTitle,
} from "./WorkspaceDom";

export type WorkspaceDialogOptions = {
  id?: string;
  title?: string;
  modal?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  className?: string | string[];
  ariaLabel?: string;
  width?: number | string;
  height?: number | string;
  render?: (contentEl: HTMLDivElement, dialog: WorkspaceDialog) => void;
  onOpen?: (dialog: WorkspaceDialog) => void;
  onClose?: () => void;
};

type WorkspaceDialogEvents = {
  open: void;
  close: void;
};

export type WorkspaceDialogHost = {
  ensureDialogLayer(): HTMLDivElement;
  emit(eventName: "dialog-open", payload: { id: string }): void;
  emit(eventName: "dialog-close", payload: { id: string }): void;
};

export class WorkspaceDialog<E extends Record<string, unknown> = Record<string, never>> extends ETarget<
  E & WorkspaceDialogEvents
> {
  readonly frameEl: HTMLDivElement;
  readonly dialogEl: HTMLDivElement;
  readonly contentEl: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private _isOpen = false;

  constructor(
    readonly id: string,
    private options: WorkspaceDialogOptions,
    private onRequestClose: () => void,
  ) {
    super();
    const frameComponent = new WorkspaceDialogFrame(id);
    this.frameEl = frameComponent.element;

    const modal = options.modal ?? true;
    const closeOnBackdrop = options.closeOnBackdrop ?? modal;

    if (modal) {
      const backdropEl = new WorkspaceDialogBackdrop();
      if (closeOnBackdrop) {
        backdropEl.listen("click", () => this.close());
      }
      this.frameEl.appendChild(backdropEl.element);
    }

    const dialogComponent = new WorkspaceDialogContainer(modal);
    this.dialogEl = dialogComponent.element;
    if (options.ariaLabel) {
      dialogComponent.setAria({ label: options.ariaLabel });
    }
    if (options.className) {
      const classNames = Array.isArray(options.className) ? options.className : [options.className];
      dialogComponent.addClass(...classNames.filter(Boolean));
    }
    if (options.width !== undefined) {
      this.dialogEl.style.width =
        typeof options.width === "number" ? `${Math.max(1, options.width)}px` : String(options.width);
    }
    if (options.height !== undefined) {
      this.dialogEl.style.height =
        typeof options.height === "number" ? `${Math.max(1, options.height)}px` : String(options.height);
    }

    const headerEl = new WorkspaceDialogHeader();
    const titleEl = new WorkspaceDialogTitle(options.title ?? "Dialog");
    this.titleEl = titleEl.element;
    headerEl.element.appendChild(this.titleEl);

    if (options.showCloseButton !== false) {
      const closeButtonEl = new WorkspaceDialogCloseButton();
      closeButtonEl.listen("click", () => this.close());
      headerEl.element.appendChild(closeButtonEl.element);
    }

    const contentEl = new WorkspaceDialogContent();
    this.contentEl = contentEl.element;

    this.dialogEl.append(headerEl.element, this.contentEl);
    this.frameEl.appendChild(this.dialogEl);
  }

  mount(layerEl: HTMLElement): this {
    if (this._isOpen) {
      return this;
    }
    layerEl.appendChild(this.frameEl);
    this._isOpen = true;
    this.options.render?.(this.contentEl, this as unknown as WorkspaceDialog);
    this.options.onOpen?.(this as unknown as WorkspaceDialog);
    this.dialogEl.focus();
    this.emit("open", undefined);
    return this;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  shouldCloseOnEscape(): boolean {
    return this.options.closeOnEscape !== false;
  }

  close(): this {
    this.onRequestClose();
    return this;
  }

  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  destroy(): void {
    if (!this._isOpen) {
      return;
    }
    this._isOpen = false;
    this.frameEl.remove();
    this.options.onClose?.();
    this.emit("close", undefined);
  }
}

export class WorkspaceDialogManager {
  private dialogs: Map<string, WorkspaceDialog> = new Map();
  private stack: string[] = [];
  private counter = 0;

  constructor(private workspace: WorkspaceDialogHost) {}

  open(options: WorkspaceDialogOptions = {}): WorkspaceDialog {
    const id = options.id?.trim() || `dialog-${++this.counter}`;
    if (this.dialogs.has(id)) {
      this.close(id);
    }

    const layerEl = this.workspace.ensureDialogLayer();
    const dialog = new WorkspaceDialog(id, options, () => this.close(id)).mount(layerEl);

    this.dialogs.set(id, dialog);
    this.stack.push(id);
    this.workspace.emit("dialog-open", { id });
    return dialog;
  }

  close(id: string): boolean {
    const dialog = this.dialogs.get(id);
    if (!dialog) {
      return false;
    }

    this.dialogs.delete(id);
    this.stack = this.stack.filter(entry => entry !== id);
    dialog.destroy();
    this.workspace.emit("dialog-close", { id });
    return true;
  }

  closeTop(): boolean {
    const top = this.getTopDialog();
    if (!top) {
      return false;
    }
    return this.close(top.id);
  }

  closeAll(): void {
    [...this.stack].reverse().forEach(id => {
      this.close(id);
    });
  }

  isOpen(id: string): boolean {
    return this.dialogs.has(id);
  }

  listOpenDialogIds(): string[] {
    return [...this.stack];
  }

  handleEscape(event: KeyboardEvent): boolean {
    const top = this.getTopDialog();
    if (!top || !top.shouldCloseOnEscape()) {
      return false;
    }
    event.preventDefault();
    this.close(top.id);
    return true;
  }

  private getTopDialog(): WorkspaceDialog | null {
    for (let i = this.stack.length - 1; i >= 0; i -= 1) {
      const dialog = this.dialogs.get(this.stack[i]);
      if (dialog) {
        return dialog;
      }
    }
    return null;
  }
}
