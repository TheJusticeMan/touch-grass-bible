import { Component } from "src/external";
import { describe, test, expect, vi } from "vitest";

// Concrete subclass for testing the abstract Component base class
class TestComponent extends Component {
  loadSpy = vi.fn();
  unloadSpy = vi.fn();

  async onload() {
    this.loadSpy();
  }

  async onunload() {
    this.unloadSpy();
  }
}

describe("Component", () => {
  test("load calls onload once", async () => {
    const c = new TestComponent();
    await c.load();
    expect(c.loadSpy).toHaveBeenCalledOnce();
  });

  test("load is idempotent (second call is a no-op)", async () => {
    const c = new TestComponent();
    await c.load();
    await c.load();
    expect(c.loadSpy).toHaveBeenCalledOnce();
  });

  test("load returns the component instance", async () => {
    const c = new TestComponent();
    const result = await c.load();
    expect(result).toBe(c);
  });

  test("unload calls onunload once", async () => {
    const c = new TestComponent();
    await c.load();
    await c.unload();
    expect(c.unloadSpy).toHaveBeenCalledOnce();
  });

  test("unload is idempotent (second call is a no-op)", async () => {
    const c = new TestComponent();
    await c.load();
    await c.unload();
    await c.unload();
    expect(c.unloadSpy).toHaveBeenCalledOnce();
  });

  test("unload before load does nothing", async () => {
    const c = new TestComponent();
    await c.unload();
    expect(c.unloadSpy).not.toHaveBeenCalled();
  });

  test("unload returns the component instance", async () => {
    const c = new TestComponent();
    await c.load();
    const result = await c.unload();
    expect(result).toBe(c);
  });

  test("registerUnload callback is called during unload", async () => {
    const c = new TestComponent();
    const cleanup = vi.fn();
    c.registerUnload(cleanup);
    await c.load();
    await c.unload();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  test("registerUnload returns the component for chaining", () => {
    const c = new TestComponent();
    expect(c.registerUnload(() => {})).toBe(c);
  });

  test("multiple registerUnload callbacks are all called", async () => {
    const c = new TestComponent();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    c.registerUnload(cb1).registerUnload(cb2);
    await c.load();
    await c.unload();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  test("addChild loads the child when parent is already loaded", async () => {
    const parent = new TestComponent();
    const child = new TestComponent();
    await parent.load();
    await parent.addChild(child);
    expect(child.loadSpy).toHaveBeenCalledOnce();
  });

  test("addChild defers child load until parent loads", async () => {
    const parent = new TestComponent();
    const child = new TestComponent();
    await parent.addChild(child);
    expect(child.loadSpy).not.toHaveBeenCalled();
    await parent.load();
    expect(child.loadSpy).toHaveBeenCalledOnce();
  });

  test("unloading parent also unloads children", async () => {
    const parent = new TestComponent();
    const child = new TestComponent();
    await parent.addChild(child);
    await parent.load();
    await parent.unload();
    expect(child.unloadSpy).toHaveBeenCalledOnce();
  });

  test("removeChild unloads the child when parent is loaded", async () => {
    const parent = new TestComponent();
    const child = new TestComponent();
    await parent.load();
    await parent.addChild(child);
    await parent.removeChild(child);
    expect(child.unloadSpy).toHaveBeenCalledOnce();
  });

  test("removeChild of unknown child is a safe no-op", async () => {
    const parent = new TestComponent();
    const child = new TestComponent();
    await parent.load();
    await expect(parent.removeChild(child)).resolves.not.toThrow();
  });

  test("child is not unloaded after parent.removeChild when parent is not loaded", async () => {
    const parent = new TestComponent();
    const child = new TestComponent();
    // Add child without loading parent first
    await parent.addChild(child);
    await parent.removeChild(child);
    expect(child.unloadSpy).not.toHaveBeenCalled();
  });
});
