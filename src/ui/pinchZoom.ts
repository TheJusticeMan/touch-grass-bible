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

export class PinchZoomHandler {
  private pinchStartDistance: number | null = null;
  private isPinching = false;
  currentScale = 1;

  constructor(
    private onZoom: (scale: number, end: boolean) => number,
    private startZoom: number,
  ) {}

  handlePinchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) {
      this.resetPinchZoom();
      return;
    }

    this.isPinching = true;
    this.pinchStartDistance = getPinchDistance(event.touches[0], event.touches[1]);
  };

  handlePinchMove = (event: TouchEvent): void => {
    if (this.isPinching && event.touches.length !== 2) this.handlePinchEnd();
    if (!this.isPinching || event.touches.length !== 2 || this.pinchStartDistance === null) return;

    event.preventDefault();
    const nextDistance = getPinchDistance(event.touches[0], event.touches[1]);
    this.currentScale = this.startZoom * (nextDistance / this.pinchStartDistance);
    this.onZoom(this.currentScale, false);
  };

  handlePinchEnd = (): void => {
    if (!this.isPinching) return;
    this.startZoom = this.onZoom(this.currentScale, true);
    this.resetPinchZoom();
  };

  private resetPinchZoom(): void {
    this.isPinching = false;
    this.pinchStartDistance = null;
  }
}
