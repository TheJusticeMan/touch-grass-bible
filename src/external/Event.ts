export abstract class ETarget {
  private handlers: {
    [eventName: string]: Array<(e: any) => void>;
  } = {};
  // Method to attach event handlers
  on(eventName: string, handler: (e: any) => void): this {
    if (!this.handlers[eventName]) {
      this.handlers[eventName] = [];
    }
    this.handlers[eventName].push(handler);
    return this;
  }

  // Method to detach event handlers
  off(eventName: string, handler: (e: any) => void): this {
    if (!this.handlers[eventName]) return this;
    this.handlers[eventName] = this.handlers[eventName].filter(h => h !== handler);
    return this;
  }

  clear(eventName?: string): this {
    if (eventName) {
      delete this.handlers[eventName];
    } else {
      this.handlers = {};
    }
    return this;
  }

  // Internal method to emit events
  emit(eventName: string, e: any = null) {
    if (this.handlers[eventName]) {
      for (const handler of this.handlers[eventName]) {
        handler(e);
      }
    }
  }
}

export class touchDragger extends ETarget {
  private startX: number = 0;
  private startY: number = 0;
  private currentX: number = 0;
  private currentY: number = 0;
  private threshold: number = 100;

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
      this.emit("draggingX", { deltaX });
    } else {
      this.emit("draggingY", { deltaY });
    }
  };

  private onTouchEnd = (): void => {
    // Reset the element's position after dragging
    const deltaX = this.currentX - this.startX;
    const deltaY = this.currentY - this.startY;

    if (Math.abs(deltaX) > this.threshold && Math.abs(deltaY) < Math.abs(deltaX)) {
      this.emit("dragX", { deltaX });
      this.emit("dragYcancel", { deltaX: 0, deltaY: 0 });
    } else if (Math.abs(deltaY) > this.threshold) {
      this.emit("dragY", { deltaY });
      this.emit("dragXcancel", { deltaX: 0, deltaY: 0 });
    } else {
      this.emit("dragCancel", { deltaX: 0, deltaY: 0 });
      this.emit("dragXcancel", { deltaX: 0, deltaY: 0 });
      this.emit("dragYcancel", { deltaX: 0, deltaY: 0 });
    }
  };
}
