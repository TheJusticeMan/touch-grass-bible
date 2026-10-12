import van, { type State } from "vanjs-core";

/**
 * A class that handles touch-based drag gestures on a given HTMLElement.
 *
 * `touchDragger` emits custom events during the drag lifecycle:
 * - `"draggingX"`: Emitted during horizontal dragging with the current `deltaX`.
 * - `"draggingY"`: Emitted during vertical dragging with the current `deltaY`.
 * - `"dragX"`: Emitted when a horizontal drag gesture passes the threshold.
 * - `"dragY"`: Emitted when a vertical drag gesture passes the threshold.
 * - `"dragCancel"`: Emitted when the drag gesture does not pass any threshold.
 * - `"dragXcancel"`: Emitted when a vertical drag is detected or drag is cancelled.
 * - `"dragYcancel"`: Emitted when a horizontal drag is detected or drag is cancelled.
 *
 * The drag direction is determined by comparing the absolute values of `deltaX` and `deltaY`.
 * Only single-finger touches are handled.
 *
 * @extends ETarget
 *
 * @example
 * ```typescript
 * const dragger = new touchDragger(element);
 * dragger.setThreshold(100);
 * dragger.on("dragX", ({ deltaX }) => { /* handle horizontal drag *\/ });
 * dragger.on("dragY", ({ deltaY }) => { /* handle vertical drag *\/ });
 * ```
 *
 * @param element The HTMLElement to attach touch event listeners to.
 *
 * @method setThreshold Sets the minimum distance (in pixels) required to trigger a drag event.
 */
export function touchDragger({
  ondraggingx,
  ondraggingy,
  ondragx,
  ondragy,
  ondragcancel,
  ondragxcancel,
  ondragycancel,
  threshold = 50,
  stylesetter = () => "",
}: {
  ondraggingx?: (e: { deltaX: number }) => void;
  ondraggingy?: (e: { deltaY: number }) => void;
  ondragx?: (e: { deltaX: number }) => void;
  ondragy?: (e: { deltaY: number }) => void;
  ondragcancel?: (e: { deltaX: number; deltaY: number }) => void;
  ondragxcancel?: (e: { deltaX: number; deltaY: number }) => void;
  ondragycancel?: (e: { deltaX: number; deltaY: number }) => void;
  threshold?: number;
  stylesetter?: ({
    deltaX,
    deltaY,
    isX,
    isY,
  }: {
    deltaX: State<number>;
    deltaY: State<number>;
    isX: boolean;
    isY: boolean;
  }) => string;
}) {
  const startX = van.state(0);
  const startY = van.state(0);
  const currentX: State<number> = van.state(0);
  const currentY: State<number> = van.state(0);

  return {
    ontouchstart: (event: TouchEvent): void => {
      if (event.touches.length > 1) return; // Only handle single-finger touches
      event.stopPropagation();
      startX.val = event.touches[0].pageX;
      startY.val = event.touches[0].pageY;
      currentX.val = startX.val;
      currentY.val = startY.val;
    },
    ontouchmove: (event: TouchEvent): void => {
      if (event.touches.length > 1) return; // Only handle single-finger touches
      event.stopPropagation();
      currentX.val = event.touches[0].pageX;
      currentY.val = event.touches[0].pageY;

      if (Math.abs(currentY.val - startY.val) < Math.abs(currentX.val - startX.val)) {
        ondraggingx?.({ deltaX: currentX.val - startX.val });
      } else {
        ondraggingy?.({ deltaY: currentY.val - startY.val });
      }
    },
    ontouchend: (): void => {
      const finalDeltaX = currentX.val - startX.val;
      const finalDeltaY = currentY.val - startY.val;

      startX.val = 0;
      startY.val = 0;
      currentX.val = 0;
      currentY.val = 0;

      if (Math.abs(finalDeltaX) > threshold && Math.abs(finalDeltaY) < Math.abs(finalDeltaX)) {
        ondragx?.({ deltaX: finalDeltaX });
        ondragycancel?.({ deltaX: 0, deltaY: 0 });
      } else if (Math.abs(finalDeltaY) > threshold) {
        ondragy?.({ deltaY: finalDeltaY });
        ondragxcancel?.({ deltaX: 0, deltaY: 0 });
      } else {
        ondragcancel?.({ deltaX: 0, deltaY: 0 });
        ondragxcancel?.({ deltaX: 0, deltaY: 0 });
        ondragycancel?.({ deltaX: 0, deltaY: 0 });
      }
    },
    onpointerdown: (event: PointerEvent): void => {
      event.stopPropagation();
    },
    style: () =>
      stylesetter({
        deltaX: van.derive(() => currentX.val - startX.val),
        deltaY: van.derive(() => currentY.val - startY.val),
        isX: Math.abs(currentX.val - startX.val) > Math.abs(currentY.val - startY.val),
        isY: Math.abs(currentY.val - startY.val) > Math.abs(currentX.val - startX.val),
      }),
  };
}
