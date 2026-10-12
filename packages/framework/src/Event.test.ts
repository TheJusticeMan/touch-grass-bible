import { describe, expect, test, vi } from "vitest";
import { touchDragger } from "./Event";
import { mobileDragController } from "./Workspace/Interactions";

type TouchInput = Pick<Touch, "pageX" | "pageY">;

function makeTouchEvent(x: number, y: number): TouchEvent {
  return {
    touches: [{ pageX: x, pageY: y } as TouchInput as Touch],
    stopPropagation: vi.fn(),
  } as unknown as TouchEvent;
}

describe("touchDragger", () => {
  test("fires a horizontal drag callback when the delta crosses the threshold", async () => {
    const ondragx = vi.fn();
    const ondragcancel = vi.fn();
    const dragger = touchDragger({
      ondragx,
      ondragcancel,
      threshold: 50,
    });

    dragger.ontouchstart(makeTouchEvent(100, 20));
    dragger.ontouchmove(makeTouchEvent(200, 25));
    dragger.ontouchend();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ondragx).toHaveBeenCalledTimes(1);
    expect(ondragx).toHaveBeenCalledWith({ deltaX: 100 });
    expect(ondragcancel).not.toHaveBeenCalled();
  });

  test("fires a vertical drag callback when the delta crosses the threshold", async () => {
    const ondragy = vi.fn();
    const ondragxcancel = vi.fn();
    const dragger = touchDragger({
      ondragy,
      ondragxcancel,
      threshold: 50,
    });

    dragger.ontouchstart(makeTouchEvent(20, 80));
    dragger.ontouchmove(makeTouchEvent(25, 180));
    dragger.ontouchend();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ondragy).toHaveBeenCalledTimes(1);
    expect(ondragy).toHaveBeenCalledWith({ deltaY: 100 });
    expect(ondragxcancel).toHaveBeenCalledTimes(1);
    expect(ondragxcancel).toHaveBeenCalledWith({ deltaX: 0, deltaY: 0 });
  });

  test("fires cancel handlers when no drag exceeds the configured threshold", () => {
    const ondragcancel = vi.fn();
    const ondragxcancel = vi.fn();
    const ondragycancel = vi.fn();
    const dragger = touchDragger({
      ondragcancel,
      ondragxcancel,
      ondragycancel,
      threshold: 60,
    });

    dragger.ontouchstart(makeTouchEvent(50, 50));
    dragger.ontouchmove(makeTouchEvent(70, 80));
    dragger.ontouchend();

    expect(ondragcancel).toHaveBeenCalledTimes(1);
    expect(ondragcancel).toHaveBeenCalledWith({ deltaX: 0, deltaY: 0 });
    expect(ondragxcancel).toHaveBeenCalledTimes(1);
    expect(ondragycancel).toHaveBeenCalledTimes(1);
  });

  test("reports the in-flight drag direction through the reactive style builder", async () => {
    const dragger = touchDragger({
      threshold: 20,
      stylesetter: ({ deltaX, deltaY, isX, isY }) => `x:${isX} y:${isY} dx:${deltaX.val} dy:${deltaY.val}`,
    });

    dragger.ontouchstart(makeTouchEvent(10, 10));
    dragger.ontouchmove(makeTouchEvent(40, 20));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dragger.style()).toContain("x:true");
    expect(dragger.style()).toContain("dx:30");
    expect(dragger.style()).toContain("dy:10");
  });

  test("ignores multi-touch gestures and never emits drag callbacks", () => {
    const ondragx = vi.fn();
    const ondraggingx = vi.fn();
    const dragger = touchDragger({ ondragx, ondraggingx, threshold: 10 });

    dragger.ontouchstart({
      touches: [{ pageX: 10, pageY: 20 } as Touch, { pageX: 60, pageY: 10 } as Touch],
      stopPropagation: vi.fn(),
    } as unknown as TouchEvent);
    dragger.ontouchmove({
      touches: [{ pageX: 90, pageY: 20 } as Touch, { pageX: 60, pageY: 10 } as Touch],
      stopPropagation: vi.fn(),
    } as unknown as TouchEvent);
    dragger.ontouchend();

    expect(ondragx).not.toHaveBeenCalled();
    expect(ondraggingx).not.toHaveBeenCalled();
  });

  test("mobile drag controller ignores pointerleave before any drag starts", () => {
    const onSettle = vi.fn();
    const controller = mobileDragController({ onSettle });

    controller.onpointerleave?.({} as PointerEvent);

    expect(onSettle).not.toHaveBeenCalled();
  });
});
