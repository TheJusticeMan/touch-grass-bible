export const DEFAULT_BASE_FONT_SIZE = 16;
export const MIN_BASE_FONT_SIZE = 12;
export const MAX_BASE_FONT_SIZE = 40;

type TouchPoint = Pick<Touch, "clientX" | "clientY">;

export function clampBaseFontSize(value: number, roundToWhole = true): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BASE_FONT_SIZE;
  }

  const clamped = Math.max(MIN_BASE_FONT_SIZE, Math.min(MAX_BASE_FONT_SIZE, value));
  return roundToWhole ? Math.round(clamped) : clamped;
}

export function getPinchDistance(first: TouchPoint, second: TouchPoint): number {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}
