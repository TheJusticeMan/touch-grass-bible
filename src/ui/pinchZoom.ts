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

export function createPinchZoomHandler(onZoom: (scale: number, end: boolean) => number, start: number) {
  let pinchStartDistance: number | null = null,
    isPinching = false,
    currentScale = start,
    startZoom = start;

  const resetPinchZoom = (): void => {
    isPinching = false;
    pinchStartDistance = null;
  };

  return {
    ontouchstart: (event: TouchEvent): void => {
      if (event.touches.length !== 2) {
        resetPinchZoom();
        return;
      }

      isPinching = true;
      pinchStartDistance = getPinchDistance(event.touches[0], event.touches[1]);
    },
    ontouchmove: (event: TouchEvent): void => {
      if (isPinching && event.touches.length !== 2) resetPinchZoom();
      if (!isPinching || event.touches.length !== 2 || pinchStartDistance === null) return;

      event.preventDefault();
      const nextDistance = getPinchDistance(event.touches[0], event.touches[1]);
      currentScale = startZoom * (nextDistance / pinchStartDistance);
      onZoom(currentScale, false);
    },
    ontouchend: (): void => {
      if (!isPinching) return;
      startZoom = onZoom(currentScale, true);
      resetPinchZoom();
    },
    ontouchcancel: (): void => {
      resetPinchZoom();
      onZoom(startZoom, true);
    },
  };
}
