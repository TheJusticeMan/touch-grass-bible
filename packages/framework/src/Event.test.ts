// @vitest-environment jsdom
import { describe, test, expect, vi } from "vitest";
import { ETarget, pdsp } from "./Event";

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
    let activeInsideHandler: typeof emitter.ActiveEvent | undefined;
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
