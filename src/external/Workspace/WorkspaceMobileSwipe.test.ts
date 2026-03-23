import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GlobalSwipeHandler } from "./WorkspaceMobileSwipe";

type Listener = (event: MouseEvent) => void;

class StyleMock {
  private values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }
}

class DocumentMock {
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: MouseEvent): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    handlers.forEach(handler => handler(event));
  }
}

function mouseEvent(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y } as MouseEvent;
}

describe("GlobalSwipeHandler click behavior", () => {
  let originalDocument: Document | undefined;
  let originalWindow: Window & typeof globalThis;
  let documentMock: DocumentMock;
  let style: StyleMock;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    documentMock = new DocumentMock();
    style = new StyleMock();

    Object.defineProperty(globalThis, "document", {
      value: documentMock,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 1000 },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  test("click without drag keeps both panels closed", () => {
    const root = { style } as unknown as HTMLElement;
    const handler = new GlobalSwipeHandler(root);

    documentMock.dispatch("mousedown", mouseEvent(200, 100));
    documentMock.dispatch("mouseup", mouseEvent(200, 100));

    expect(style.getPropertyValue("--rightpanel-open")).toBe("-100%");
    expect(style.getPropertyValue("--leftpanel-open")).toBe("100%");
    expect(handler.state).toBe("none");

    handler.destroy();
  });

  test("click in main pane does not close right panel when already open", () => {
    const root = { style } as unknown as HTMLElement;
    const handler = new GlobalSwipeHandler(root);

    handler.state = "rightopen";
    style.setProperty("--rightpanel-open", "0%");

    documentMock.dispatch("mousedown", mouseEvent(400, 200));
    documentMock.dispatch("mouseup", mouseEvent(400, 200));

    expect(style.getPropertyValue("--rightpanel-open")).toBe("0%");
    expect(handler.state).toBe("rightopen");

    handler.destroy();
  });

  test("click in main pane does not close left panel when already open", () => {
    const root = { style } as unknown as HTMLElement;
    const handler = new GlobalSwipeHandler(root);

    handler.state = "leftopen";
    style.setProperty("--leftpanel-open", "0%");

    documentMock.dispatch("mousedown", mouseEvent(500, 220));
    documentMock.dispatch("mouseup", mouseEvent(500, 220));

    expect(style.getPropertyValue("--leftpanel-open")).toBe("0%");
    expect(handler.state).toBe("leftopen");

    handler.destroy();
  });
});
