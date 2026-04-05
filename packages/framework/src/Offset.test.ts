import { describe, test, expect } from "vitest";
import { Offset } from "./Offset";

describe("Offset", () => {
  test("constructor sets x and y", () => {
    const o = new Offset(3, 4);
    expect(o.x).toBe(3);
    expect(o.y).toBe(4);
  });

  test("add returns a new Offset with summed components", () => {
    const a = new Offset(1, 2);
    const b = new Offset(3, 4);
    const result = a.add(b);
    expect(result.x).toBe(4);
    expect(result.y).toBe(6);
    // Originals unchanged
    expect(a.x).toBe(1);
  });

  test("subtract returns a new Offset with differenced components", () => {
    const a = new Offset(5, 7);
    const b = new Offset(2, 3);
    const result = a.subtract(b);
    expect(result.x).toBe(3);
    expect(result.y).toBe(4);
  });

  test("scale returns a new Offset scaled by factor", () => {
    const o = new Offset(3, 4);
    const scaled = o.scale(2);
    expect(scaled.x).toBe(6);
    expect(scaled.y).toBe(8);
  });

  test("scale by 0 returns Offset(0, 0)", () => {
    const o = new Offset(10, 20);
    const scaled = o.scale(0);
    expect(scaled.x).toBe(0);
    expect(scaled.y).toBe(0);
  });

  test("distanceTo computes Euclidean distance", () => {
    const a = new Offset(0, 0);
    const b = new Offset(3, 4);
    expect(a.distanceTo(b)).toBeCloseTo(5, 10);
  });

  test("distanceTo is symmetric", () => {
    const a = new Offset(1, 2);
    const b = new Offset(4, 6);
    expect(a.distanceTo(b)).toBeCloseTo(b.distanceTo(a), 10);
  });

  test("distanceTo of same point is 0", () => {
    const a = new Offset(5, 5);
    expect(a.distanceTo(new Offset(5, 5))).toBe(0);
  });

  test("applyDampening reduces magnitude", () => {
    const o = new Offset(100, 100);
    // The dampening formula uses power 0.7: sign(x) * |x|^0.7 / dampening.
    // The sub-linear exponent (< 1) creates a "soft" damping effect where large
    // values are reduced more than small ones, producing a smoother feel.
    const dampened = o.applyDampening(1);
    expect(dampened.x).toBeCloseTo(Math.pow(100, 0.7), 5);
    expect(dampened.y).toBeCloseTo(Math.pow(100, 0.7), 5);
  });

  test("applyDampening preserves sign for negative values", () => {
    const o = new Offset(-64, 64);
    const dampened = o.applyDampening(1);
    expect(dampened.x).toBeLessThan(0);
    expect(dampened.y).toBeGreaterThan(0);
  });

  test("ratio returns abs(x/y)", () => {
    const o = new Offset(3, 4);
    expect(o.ratio).toBeCloseTo(0.75, 10);
  });

  test("ratio for negative x and y returns a positive value", () => {
    const o = new Offset(-6, -3);
    expect(o.ratio).toBe(2);
  });
});
