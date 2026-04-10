import { describe, expect, test } from "vitest";
import {
  clampBaseFontSize,
  DEFAULT_BASE_FONT_SIZE,
  getPinchDistance,
  MAX_BASE_FONT_SIZE,
  MIN_BASE_FONT_SIZE,
} from "./pinchZoom";

describe("pinchZoom helpers", () => {
  test("clamps font size to configured bounds", () => {
    expect(clampBaseFontSize(MIN_BASE_FONT_SIZE - 10)).toBe(MIN_BASE_FONT_SIZE);
    expect(clampBaseFontSize(MAX_BASE_FONT_SIZE + 10)).toBe(MAX_BASE_FONT_SIZE);
  });

  test("rounds to whole pixel font sizes", () => {
    expect(clampBaseFontSize(18.4)).toBe(18);
    expect(clampBaseFontSize(18.6)).toBe(19);
  });

  test("keeps decimal font sizes when rounding is disabled", () => {
    expect(clampBaseFontSize(18.4, false)).toBe(18.4);
    expect(clampBaseFontSize(18.6, false)).toBe(18.6);
  });

  test("falls back to the default font size for invalid numbers", () => {
    expect(clampBaseFontSize(Number.NaN)).toBe(DEFAULT_BASE_FONT_SIZE);
    expect(clampBaseFontSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_BASE_FONT_SIZE);
  });

  test("measures pinch distance from two touch points", () => {
    expect(getPinchDistance({ clientX: 0, clientY: 0 } as Touch, { clientX: 3, clientY: 4 } as Touch)).toBe(
      5,
    );
  });
});
