import { describe, it, expect } from "vitest";
import { createOneEuroFilter, createPointFilter } from "../filter";

describe("createOneEuroFilter", () => {
  it("passes through first value unchanged", () => {
    const f = createOneEuroFilter();
    expect(f.filter(5.0, 0)).toBe(5.0);
  });

  it("smooths subsequent values", () => {
    const f = createOneEuroFilter({ minCutoff: 1.0, beta: 0.0 });
    f.filter(0, 0);
    const result = f.filter(10, 16); // 16ms later
    // With beta=0, smoothing is aggressive — result should be between 0 and 10
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });

  it("reduces jitter on noisy signal", () => {
    const f = createOneEuroFilter({ minCutoff: 1.0, beta: 0.007 });
    const noisy = [5, 5.3, 4.7, 5.1, 4.9, 5.2, 4.8, 5.0];
    const filtered: number[] = [];
    for (let i = 0; i < noisy.length; i++) {
      filtered.push(f.filter(noisy[i]!, i * 16));
    }
    // Filtered signal variance should be less than original
    const variance = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    };
    expect(variance(filtered)).toBeLessThan(variance(noisy));
  });

  it("resets state", () => {
    const f = createOneEuroFilter();
    f.filter(100, 0);
    f.filter(100, 16);
    f.reset();
    // After reset, first call should pass through
    expect(f.filter(0, 32)).toBe(0);
  });

  it("handles same timestamp gracefully", () => {
    const f = createOneEuroFilter();
    f.filter(5, 0);
    const result = f.filter(10, 0); // te=0
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("createPointFilter", () => {
  it("filters x and y independently", () => {
    const pf = createPointFilter({ minCutoff: 1.0, beta: 0.0 });
    const p0 = pf.filter({ x: 0, y: 0 }, 0);
    expect(p0.x).toBe(0);
    expect(p0.y).toBe(0);

    const p1 = pf.filter({ x: 10, y: -10 }, 16);
    expect(p1.x).toBeGreaterThan(0);
    expect(p1.x).toBeLessThan(10);
    expect(p1.y).toBeGreaterThan(-10);
    expect(p1.y).toBeLessThan(0);
  });

  it("resets both axes", () => {
    const pf = createPointFilter();
    pf.filter({ x: 100, y: 100 }, 0);
    pf.reset();
    const result = pf.filter({ x: 0, y: 0 }, 16);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});
