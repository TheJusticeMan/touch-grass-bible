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

  // Internal method to emit events
  protected emit(eventName: string, e: any = null) {
    if (this.handlers[eventName]) {
      for (const handler of this.handlers[eventName]) {
        handler(e);
      }
    }
  }
}
