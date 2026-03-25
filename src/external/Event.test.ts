// @vitest-environment jsdom
import { describe, test, expect, vi } from "vitest";
import { ETarget, pdsp, touchDragger } from "./Event";

// Concrete subclass for testing the abstract ETarget
class TestEmitter extends ETarget<{ foo: number; bar: string; baz: undefined }> {}

describe("ETarget", () => {
  test("on registers a handler that is called on emit", () => {
    const emitter = new TestEmitter();
    const handler = vi.fn();
    emitter.on("foo", handler);
    emitter.emit("foo", 42);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(42);
  });

  test("on supports multiple handlers for the same event", () => {
    const emitter = new TestEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("foo", h1).on("foo", h2);
    emitter.emit("foo", 1);
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  test("off removes a specific handler", () => {
    const emitter = new TestEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("foo", h1).on("foo", h2);
    emitter.off("foo", h1);
    emitter.emit("foo", 7);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  test("off on unknown event returns self without error", () => {
    const emitter = new TestEmitter();
    expect(() => emitter.off("foo", vi.fn())).not.toThrow();
  });

  test("clear(eventName) removes all handlers for that event", () => {
    const emitter = new TestEmitter();
    const h = vi.fn();
    emitter.on("foo", h).on("foo", h);
    emitter.clear("foo");
    emitter.emit("foo", 5);
    expect(h).not.toHaveBeenCalled();
  });

  test("clear() with no argument removes all handlers", () => {
    const emitter = new TestEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("foo", h1).on("bar", h2);
    emitter.clear();
    emitter.emit("foo", 0);
    emitter.emit("bar", "x");
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  test("emit with no data argument passes empty object as default", () => {
    const emitter = new TestEmitter();
    const handler = vi.fn();
    emitter.on("baz", handler);
    emitter.emit("baz");
    expect(handler).toHaveBeenCalledWith({});
  });

  test("onany handler is called for every emitted event", () => {
    const emitter = new TestEmitter();
    const anyHandler = vi.fn();
    emitter.onany(anyHandler);
    emitter.emit("foo", 1);
    emitter.emit("bar", "hello");
    expect(anyHandler).toHaveBeenCalledTimes(2);
    expect(anyHandler).toHaveBeenNthCalledWith(1, "foo", 1);
    expect(anyHandler).toHaveBeenNthCalledWith(2, "bar", "hello");
  });

  test("next invokes the callback synchronously and returns self", () => {
    const emitter = new TestEmitter();
    const cb = vi.fn();
    const result = emitter.next(cb);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(emitter);
    expect(result).toBe(emitter);
  });

  test("cancelOn unsubscribes a handler when the specified event fires", () => {
    const source = new TestEmitter();
    const target = new TestEmitter();
    const h = vi.fn();
    target.on("foo", h);
    // cancelOn("bar", target): when source emits "bar", unsubscribe target's lastHandler ("foo", h)
    source.cancelOn("bar", target);
    source.emit("bar", "trigger");
    target.emit("foo", 99);
    expect(h).not.toHaveBeenCalled();
  });

  test("cancelOn does nothing when target has no lastHandler", () => {
    const source = new TestEmitter();
    const target = new TestEmitter();
    // No handlers registered on target, so lastHandler is undefined
    expect(() => source.cancelOn("bar", target)).not.toThrow();
    expect(() => source.emit("bar", "x")).not.toThrow();
  });

  test("ActiveEvent reflects the currently-emitting event name", () => {
    const emitter = new TestEmitter();
    let activeInsideHandler: (typeof emitter.ActiveEvent) | undefined;
    emitter.on("foo", () => {
      activeInsideHandler = emitter.ActiveEvent;
    });
    emitter.emit("foo", 0);
    expect(activeInsideHandler).toBe("foo");
    // After emit completes, ActiveEvent should be null
    expect(emitter.ActiveEvent).toBeNull();
  });

  test("method chaining returns the same instance", () => {
    const emitter = new TestEmitter();
    const h = vi.fn();
    const result = emitter.on("foo", h).on("bar", vi.fn()).off("bar", vi.fn()).clear("bar");
    expect(result).toBe(emitter);
  });
});

describe("pdsp", () => {
  test("calls preventDefault and stopPropagation, then the callback", () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;

    const cb = vi.fn();
    const wrapped = pdsp(cb);
    wrapped(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(event);
  });

  test("returns a new function wrapping the callback", () => {
    const cb = vi.fn();
    const wrapped = pdsp(cb);
    expect(typeof wrapped).toBe("function");
    expect(wrapped).not.toBe(cb);
  });
});

describe("touchDragger", () => {
  function makeTouchEvent(type: string, x: number, y: number, touchCount = 1): TouchEvent {
    const touch = { pageX: x, pageY: y } as Touch;
    const touches = touchCount === 1 ? [touch] : [touch, touch];
    return new TouchEvent(type, {
      touches: touches as unknown as Touch[],
      bubbles: true,
    });
  }

  function makeElement(): HTMLElement {
    return document.createElement("div");
  }

  test("setThreshold returns this for chaining", () => {
    const el = makeElement();
    const dragger = new touchDragger(el);
    expect(dragger.setThreshold(100)).toBe(dragger);
  });

  test("emits draggingX when horizontal movement dominates", () => {
    const el = makeElement();
    const dragger = new touchDragger(el);
    const onDraggingX = vi.fn();
    dragger.on("draggingX", onDraggingX);

    el.dispatchEvent(makeTouchEvent("touchstart", 0, 0));
    el.dispatchEvent(makeTouchEvent("touchmove", 80, 5));

    expect(onDraggingX).toHaveBeenCalledWith({ deltaX: 80 });
  });

  test("emits draggingY when vertical movement dominates", () => {
    const el = makeElement();
    const dragger = new touchDragger(el);
    const onDraggingY = vi.fn();
    dragger.on("draggingY", onDraggingY);

    el.dispatchEvent(makeTouchEvent("touchstart", 0, 0));
    el.dispatchEvent(makeTouchEvent("touchmove", 5, 80));

    expect(onDraggingY).toHaveBeenCalledWith({ deltaY: 80 });
  });

  test("emits dragX and dragYcancel when horizontal drag exceeds threshold", () => {
    const el = makeElement();
    const dragger = new touchDragger(el).setThreshold(50);
    const onDragX = vi.fn();
    const onDragYcancel = vi.fn();
    dragger.on("dragX", onDragX).on("dragYcancel", onDragYcancel);

    el.dispatchEvent(makeTouchEvent("touchstart", 0, 0));
    el.dispatchEvent(makeTouchEvent("touchmove", 100, 10));
    el.dispatchEvent(makeTouchEvent("touchend", 100, 10));

    expect(onDragX).toHaveBeenCalledWith({ deltaX: 100 });
    expect(onDragYcancel).toHaveBeenCalled();
  });

  test("emits dragY and dragXcancel when vertical drag exceeds threshold", () => {
    const el = makeElement();
    const dragger = new touchDragger(el).setThreshold(50);
    const onDragY = vi.fn();
    const onDragXcancel = vi.fn();
    dragger.on("dragY", onDragY).on("dragXcancel", onDragXcancel);

    el.dispatchEvent(makeTouchEvent("touchstart", 0, 0));
    el.dispatchEvent(makeTouchEvent("touchmove", 0, 100));
    el.dispatchEvent(makeTouchEvent("touchend", 0, 100));

    expect(onDragY).toHaveBeenCalledWith({ deltaY: 100 });
    expect(onDragXcancel).toHaveBeenCalled();
  });

  test("emits dragCancel, dragXcancel and dragYcancel when drag is below threshold", () => {
    const el = makeElement();
    const dragger = new touchDragger(el).setThreshold(50);
    const onDragCancel = vi.fn();
    const onDragXcancel = vi.fn();
    const onDragYcancel = vi.fn();
    dragger.on("dragCancel", onDragCancel).on("dragXcancel", onDragXcancel).on("dragYcancel", onDragYcancel);

    el.dispatchEvent(makeTouchEvent("touchstart", 0, 0));
    el.dispatchEvent(makeTouchEvent("touchmove", 10, 5));
    el.dispatchEvent(makeTouchEvent("touchend", 10, 5));

    expect(onDragCancel).toHaveBeenCalled();
    expect(onDragXcancel).toHaveBeenCalled();
    expect(onDragYcancel).toHaveBeenCalled();
  });

  test("ignores multi-finger touchstart and touchmove", () => {
    const el = makeElement();
    const dragger = new touchDragger(el).setThreshold(50);
    const onDragX = vi.fn();
    dragger.on("dragX", onDragX);

    // Multi-touch touchstart is ignored, so startX/startY are never set.
    // A subsequent touchend with a large deltaX will therefore compute a
    // delta of 0 (currentX − startX = 0) and not fire dragX.
    el.dispatchEvent(makeTouchEvent("touchstart", 0, 0, 2));
    el.dispatchEvent(makeTouchEvent("touchmove", 200, 0, 2));
    // End with single touch — but since start was multi-touch, startX/Y remain 0
    el.dispatchEvent(makeTouchEvent("touchend", 200, 0, 1));

    expect(onDragX).not.toHaveBeenCalled();
  });
});
