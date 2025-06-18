import { App } from "./App";

export class Chainable {
  next(callback: (a: this) => void): this {
    callback(this); // Use setTimeout to ensure the callback is executed in the next event loop cycle
    return this;
  }
}

export type HandlerInfo<E, K extends keyof E = keyof E> = {
  eventName: K;
  handler: (e: E[K]) => void;
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
export abstract class ETarget<E extends Record<string, any> = Record<string, any>> extends Chainable {
  private handlers: {
    [K in keyof E]?: Array<(e: E[K]) => void>;
  } = {};
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
  cancelOn<K extends keyof E>(unsubscribeOn: K, event: ETarget) {
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
export class touchDragger extends ETarget<{
  draggingX: { deltaX: number };
  draggingY: { deltaY: number };
  dragX: { deltaX: number };
  dragY: { deltaY: number };
  dragCancel: { deltaX: number; deltaY: number };
  dragXcancel: { deltaX: number; deltaY: number };
  dragYcancel: { deltaX: number; deltaY: number };
}> {
  private startX: number = 0;
  private startY: number = 0;
  private currentX: number = 0;
  private currentY: number = 0;
  private threshold: number = 50;

  constructor(element: HTMLElement) {
    super();
    element.addEventListener("touchstart", this.onTouchStart, { passive: true });
    element.addEventListener("touchmove", this.onTouchMove, { passive: true });
    element.addEventListener("touchend", this.onTouchEnd, { passive: true });
  }

  private onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length > 1) return; // Only handle single-finger touches
    this.startX = event.touches[0].pageX;
    this.startY = event.touches[0].pageY;
    this.currentX = this.startX;
    this.currentY = this.startY;
  };

  private onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) return; // Only handle single-finger touches
    this.currentX = event.touches[0].pageX;
    this.currentY = event.touches[0].pageY;

    const deltaX = this.currentX - this.startX;
    const deltaY = this.currentY - this.startY;

    // Apply translation to the element
    if (Math.abs(deltaY) < Math.abs(deltaX)) {
      this.emit("draggingX", { deltaX } as any);
    } else {
      this.emit("draggingY", { deltaY } as any);
    }
  };

  private onTouchEnd = (): void => {
    // Reset the element's position after dragging
    const deltaX = this.currentX - this.startX;
    const deltaY = this.currentY - this.startY;

    if (Math.abs(deltaX) > this.threshold && Math.abs(deltaY) < Math.abs(deltaX)) {
      this.emit("dragX", { deltaX } as any);
      this.emit("dragYcancel", { deltaX: 0, deltaY: 0 } as any);
    } else if (Math.abs(deltaY) > this.threshold) {
      this.emit("dragY", { deltaY } as any);
      this.emit("dragXcancel", { deltaX: 0, deltaY: 0 } as any);
    } else {
      this.emit("dragCancel", { deltaX: 0, deltaY: 0 } as any);
      this.emit("dragXcancel", { deltaX: 0, deltaY: 0 } as any);
      this.emit("dragYcancel", { deltaX: 0, deltaY: 0 } as any);
    }
  };

  /**
   * Sets the threshold value for the current instance.
   *
   * @param value - The new threshold value to be set.
   * @returns The current instance for method chaining.
   */
  setThreshold(value: number): this {
    this.threshold = value;
    return this;
  }
}

export abstract class Openable<AppType extends App, E extends Record<string, any>> extends ETarget<E> {
  private _isOpen = false;
  constructor(private appInstance: AppType) {
    super();
    this.on("EscapeKeyDown", () => this.close());
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(): this {
    if (!this._isOpen) {
      this._isOpen = true;
      this.appInstance.pushTarget(this);
      this.onopen();
      this.emit("open");
    }
    return this;
  }

  close(): this {
    if (this._isOpen) {
      this._isOpen = false;
      this.appInstance.popTarget();
      this.onclose();
      this.emit("close");
    }
    return this;
  }

  abstract onopen(): void;
  abstract onclose(): void;
}
