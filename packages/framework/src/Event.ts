import van, { State } from "vanjs-core";

class Chainable {
  next(callback: (a: this) => void): this {
    callback(this); // Use setTimeout to ensure the callback is executed in the next event loop cycle
    return this;
  }
}

type HandlerInfo<E, K extends keyof E = keyof E> = {
  eventName: K;
  handler: (e: E[K]) => void;
};

type CancelOnTarget = {
  lastHandler?: { eventName: PropertyKey; handler: unknown };
  off(eventName: PropertyKey, handler: unknown): unknown;
};

/**
 * Abstract base class providing a chainable event handling system.
 *
 * `ETarget` allows registering, removing, and emitting named events with associated handlers.
 * It supports method chaining for fluent API usage and provides utilities for automatic handler
 * unsubscription based on other events.
 *
 * @remarks
 * - Handlers are stored per event name and can be added or removed individually.
 * - The `cancelOn` method enables automatic unsubscription of a handler when a specified event occurs.
 *
 * @example
 * ```typescript
 * class MyEmitter extends ETarget {}
 * const emitter = new MyEmitter();
 * emitter.on('foo', e => console.log(e)).emit('foo', 42); // logs 42
 * ```
 *
 * @public
 */
export abstract class ETarget<E extends Record<string, unknown> = Record<string, unknown>> extends Chainable {
  private handlers: { [K in keyof E]?: Array<(e: E[K]) => void> } = {};
  private anyhandlers: Array<(eventName: keyof E, e: E[keyof E]) => void> = [];
  lastHandler?: HandlerInfo<E, keyof E>;
  _ActiveEvent: (keyof E)[] = [];

  /**
   * Registers an event handler for the specified event name.
   *
   * @param eventName - The name of the event to listen for.
   * @param handler - The callback function to invoke when the event is emitted.
   * @returns The current instance for method chaining.
   */
  on<K extends keyof E>(eventName: K, handler: (e: E[K]) => void): this {
    if (!this.handlers[eventName]) this.handlers[eventName] = [];
    this.handlers[eventName]!.push(handler);
    this.lastHandler = { eventName, handler } as unknown as HandlerInfo<E, keyof E>;
    return this;
  }

  onany(handler: (eventName: keyof E, e: E[keyof E]) => void): this {
    this.anyhandlers.push(handler);
    return this;
  }

  /**
   * Removes a previously registered event handler for the specified event.
   *
   * @param eventName - The name of the event to remove the handler from.
   * @param handler - The event handler function to remove.
   * @returns The current instance for method chaining.
   */
  off<K extends keyof E>(eventName: K, handler: (e: E[K]) => void): this {
    if (!this.handlers[eventName]) return this;
    this.handlers[eventName] = this.handlers[eventName]!.filter(h => h !== handler);
    return this;
  }

  /**
   * Removes event handlers.
   *
   * If an `eventName` is provided, removes all handlers associated with that event.
   * If no `eventName` is specified, removes all handlers for all events.
   *
   * @param eventName - (Optional) The name of the event whose handlers should be removed.
   * @returns The current instance for method chaining.
   */
  clear(eventName?: keyof E): this {
    if (eventName) delete this.handlers[eventName];
    else this.handlers = {};
    return this;
  }

  /**
   * Emits an event with the specified name, invoking all registered handlers for that event.
   *
   * @param eventName - The name of the event to emit.
   * @param e - Optional event data to pass to each handler.
   * @returns The current instance for method chaining.
   */
  emit<K extends keyof E>(eventName: K, e: E[K] = {} as E[K]): this {
    this._ActiveEvent.push(eventName);
    this.handlers[eventName]?.forEach(handler => handler(e));
    this.anyhandlers.forEach(handler => handler(eventName, e));
    this._ActiveEvent.pop();
    return this;
  }

  /**
   * Registers a handler to automatically unsubscribe from a specific event when another event occurs.
   *
   * @param unsubscribeOn - The event that will trigger the unsubscription.
   * @param event - The event object containing the handler to be unsubscribed.
   * @returns The current instance for method chaining.
   */
  cancelOn<K extends keyof E>(unsubscribeOn: K, event: CancelOnTarget) {
    const theHandler = event.lastHandler;
    if (theHandler) {
      this.on(unsubscribeOn, () => event.off(theHandler.eventName, theHandler.handler));
    }
    return this;
  }

  get ActiveEvent(): keyof E | null {
    return this._ActiveEvent.at(-1) || null;
  }
}

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
  let startX: number = 0;
  let startY: number = 0;
  const currentX: State<number> = van.state(0);
  const currentY: State<number> = van.state(0);
  const deltaX: State<number> = van.derive(() => currentX.val - startX);
  const deltaY: State<number> = van.derive(() => currentY.val - startY);

  const ontouchstart = (event: TouchEvent): void => {
    if (event.touches.length > 1) return; // Only handle single-finger touches
    startX = event.touches[0].pageX;
    startY = event.touches[0].pageY;
    currentX.val = startX;
    currentY.val = startY;
  };

  const ontouchmove = (event: TouchEvent): void => {
    if (event.touches.length > 1) return; // Only handle single-finger touches
    currentX.val = event.touches[0].pageX;
    currentY.val = event.touches[0].pageY;

    if (Math.abs(deltaY.val) < Math.abs(deltaX.val)) {
      ondraggingx?.({ deltaX: deltaX.val });
    } else {
      ondraggingy?.({ deltaY: deltaY.val });
    }
  };

  const ontouchend = (): void => {
    startX = 0;
    startY = 0;
    currentX.val = 0;
    currentY.val = 0;

    if (Math.abs(deltaX.val) > threshold && Math.abs(deltaY.val) < Math.abs(deltaX.val)) {
      ondragx?.({ deltaX: deltaX.val });
      ondragycancel?.({ deltaX: 0, deltaY: 0 });
    } else if (Math.abs(deltaY.val) > threshold) {
      ondragy?.({ deltaY: deltaY.val });
      ondragxcancel?.({ deltaX: 0, deltaY: 0 });
    } else {
      ondragcancel?.({ deltaX: 0, deltaY: 0 });
      ondragxcancel?.({ deltaX: 0, deltaY: 0 });
      ondragycancel?.({ deltaX: 0, deltaY: 0 });
    }
  };

  return {
    ontouchstart,
    ontouchmove,
    ontouchend,
    style: () =>
      stylesetter({
        deltaX,
        deltaY,
        isX: Math.abs(deltaX.val) > Math.abs(deltaY.val),
        isY: Math.abs(deltaY.val) > Math.abs(deltaX.val),
      }),
  };
}

export function pdsp(cb: (e: Event) => void): (e: Event) => void {
  return (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    cb(e);
  };
}
