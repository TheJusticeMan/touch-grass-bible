import { describe, test, expect } from "vitest";
import { deepMerge } from "./deepMerge";

describe("deepMerge", () => {
  test("returns defaults when saved is empty", () => {
    const defaults = { a: 1, b: "hello" };
    expect(deepMerge(defaults, {})).toEqual({ a: 1, b: "hello" });
  });

  test("overrides top-level primitive values from saved", () => {
    const defaults = { a: 1, b: "hello" };
    expect(deepMerge(defaults, { a: 2 })).toEqual({ a: 2, b: "hello" });
  });

  test("does not mutate the defaults object", () => {
    const defaults = { a: 1, b: 2 };
    deepMerge(defaults, { a: 99 });
    expect(defaults.a).toBe(1);
  });

  test("deeply merges nested plain objects", () => {
    const defaults = { theme: { color: "blue", size: 12 } };
    const saved = { theme: { color: "red" } };
    expect(deepMerge(defaults, saved)).toEqual({ theme: { color: "red", size: 12 } });
  });

  test("replaces nested object in saved when defaults key is not a plain object", () => {
    const defaults = { items: [1, 2, 3] as unknown };
    const saved = { items: [4, 5] as unknown };
    // defaults.items is an Array (not a plain object), so saved value replaces it directly
    const result = deepMerge(defaults as { items: unknown }, saved as { items: unknown });
    expect(result.items).toEqual([4, 5]);
  });

  test("uses saved nested object directly when defaults key is not a plain object", () => {
    const defaults = { config: null as unknown };
    const saved = { config: { x: 1 } as unknown };
    const result = deepMerge(defaults as { config: unknown }, saved as { config: unknown });
    expect(result.config).toEqual({ x: 1 });
  });

  test("ignores undefined values in saved", () => {
    const defaults = { a: 10, b: 20 };
    const saved = { a: undefined };
    expect(deepMerge(defaults, saved)).toEqual({ a: 10, b: 20 });
  });

  test("handles multiple levels of nesting", () => {
    const defaults = { l1: { l2: { l3: "deep" } } };
    const saved = { l1: { l2: { l3: "overridden" } } };
    expect(deepMerge(defaults, saved)).toEqual({ l1: { l2: { l3: "overridden" } } });
  });

  test("adds new keys from saved that are not in defaults", () => {
    const defaults = { a: 1 } as { a: number; extra?: string };
    const saved = { extra: "bonus" } as { extra: string };
    const result = deepMerge(defaults, saved);
    expect((result as { a: number; extra: string }).extra).toBe("bonus");
  });

  test("handles booleans and zero as valid non-undefined primitives", () => {
    const defaults = { flag: true, count: 5 };
    const saved = { flag: false, count: 0 };
    expect(deepMerge(defaults, saved)).toEqual({ flag: false, count: 0 });
  });
});
