import type { Point2D, FilterOptions } from "./types";

function smoothingFactor(te: number, cutoff: number): number {
  const tau = 1.0 / (2 * Math.PI * cutoff);
  return 1.0 / (1.0 + tau / te);
}

function exponentialSmoothing(
  alpha: number,
  current: number,
  previous: number,
): number {
  return alpha * current + (1 - alpha) * previous;
}

export interface OneEuroFilter {
  filter(value: number, timestamp: number): number;
  reset(): void;
}

export function createOneEuroFilter(
  options: FilterOptions = {},
): OneEuroFilter {
  const minCutoff = options.minCutoff ?? 1.0;
  const beta = options.beta ?? 0.007;
  const dCutoff = options.dCutoff ?? 1.0;

  let lastTime = -1;
  let lastValue = 0;
  let lastDx = 0;

  return {
    filter(value: number, timestamp: number): number {
      if (lastTime < 0) {
        lastTime = timestamp;
        lastValue = value;
        lastDx = 0;
        return value;
      }

      const te = timestamp - lastTime;
      if (te <= 0) return lastValue;

      const dx = (value - lastValue) / te;
      const edx = exponentialSmoothing(
        smoothingFactor(te, dCutoff),
        dx,
        lastDx,
      );
      const cutoff = minCutoff + beta * Math.abs(edx);
      const result = exponentialSmoothing(
        smoothingFactor(te, cutoff),
        value,
        lastValue,
      );

      lastTime = timestamp;
      lastValue = result;
      lastDx = edx;

      return result;
    },
    reset() {
      lastTime = -1;
      lastValue = 0;
      lastDx = 0;
    },
  };
}

export interface PointFilter {
  filter(point: Point2D, timestamp: number): Point2D;
  reset(): void;
}

export function createPointFilter(options: FilterOptions = {}): PointFilter {
  const xFilter = createOneEuroFilter(options);
  const yFilter = createOneEuroFilter(options);

  return {
    filter(point: Point2D, timestamp: number): Point2D {
      return {
        x: xFilter.filter(point.x, timestamp),
        y: yFilter.filter(point.y, timestamp),
      };
    },
    reset() {
      xFilter.reset();
      yFilter.reset();
    },
  };
}
