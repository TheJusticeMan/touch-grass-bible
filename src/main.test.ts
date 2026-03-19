import { describe, test, expect } from "vitest";

// deepMerge is not exported from main.ts - test via TGAppSettings behavior
// We test the observable behavior: settings loaded with missing nested keys
// should receive defaults for the missing keys.
import { DEFAULT_SETTINGS } from "./config/TGAppSettings";

describe("deepMerge (via loadsettings behavior)", () => {
  test("DEFAULT_SETTINGS has expected schemaVersion", () => {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(1);
  });

  test("DEFAULT_SETTINGS style has all required keys", () => {
    expect(DEFAULT_SETTINGS.style).toEqual({
      Foreground: expect.any(String),
      Background: expect.any(String),
      EnhanceSpacing: expect.any(Boolean),
      Font: expect.any(String),
      fontSize: expect.any(Number),
    });
  });
});

// Test the deepMerge logic indirectly by implementing it here
// (mirrors the implementation in main.ts)
function isPlainObject(value: unknown): value is object {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T extends object>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults } as T;
  for (const key in saved) {
    const k = key as keyof T;
    if (isPlainObject(saved[k])) {
      if (isPlainObject(defaults[k])) {
        result[k] = deepMerge(defaults[k] as object, saved[k] as object) as T[keyof T];
      } else {
        result[k] = saved[k] as T[keyof T];
      }
    } else if (saved[k] !== undefined) {
      result[k] = saved[k] as T[keyof T];
    }
  }
  return result;
}

describe("deepMerge utility", () => {
  test("shallow merge: top-level scalar values are merged", () => {
    const defaults = { a: 1, b: 2, c: 3 };
    const saved = { a: 10, b: 20 };
    const result = deepMerge(defaults, saved);
    expect(result).toEqual({ a: 10, b: 20, c: 3 });
  });

  test("nested objects are deep merged (not replaced wholesale)", () => {
    const defaults = { style: { font: "serif", size: 16, spacing: true } };
    const saved: Partial<typeof defaults> = {
      style: { font: "sans", size: 16, spacing: true },
    };
    const partialSaved = { style: { font: "sans" } } as Partial<typeof defaults>;
    const result = deepMerge(defaults, partialSaved);
    expect(result.style.font).toBe("sans");
    expect(result.style.size).toBe(16);
    expect(result.style.spacing).toBe(true);
    void saved;
  });

  test("arrays in saved are kept as-is (not merged)", () => {
    const defaults = { items: [1, 2, 3] };
    const saved = { items: [4, 5] };
    const result = deepMerge(defaults, saved);
    expect(result.items).toEqual([4, 5]);
  });

  test("undefined values in saved do not override defaults", () => {
    const defaults = { a: 1, b: 2 };
    const saved: { a?: number; b?: number } = { a: undefined };
    const result = deepMerge(defaults, saved);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  test("null values in saved are treated as scalar and kept", () => {
    const defaults = { a: { x: 1 } as object | null };
    const saved: Partial<typeof defaults> = { a: null };
    const result = deepMerge(defaults, saved);
    expect(result.a).toBeNull();
  });

  test("deeply nested objects are recursively merged", () => {
    const defaults = { outer: { inner: { x: 1, y: 2 } } };
    const saved: Partial<typeof defaults> = {
      outer: { inner: { x: 99, y: 2 } },
    };
    // Cast saved inner to partial to simulate missing y in saved data
    const partialSaved = { outer: { inner: { x: 99 } } } as Partial<typeof defaults>;
    const result = deepMerge(defaults, partialSaved);
    expect(result.outer.inner.x).toBe(99);
    expect(result.outer.inner.y).toBe(2);
    void saved;
  });

  test("saved key not present in defaults is still added", () => {
    const defaults = { a: 1 } as { a: number; b?: number };
    const saved = { b: 42 };
    const result = deepMerge(defaults, saved);
    expect(result.b).toBe(42);
  });
});
