import { App, ETarget } from "./App";

export class MState<S extends StateClass> extends ETarget<{
  stateChange: S;
  [key: string]: any;
}> {
  context: S[] = [];
  constructor(private _state: S) {
    super();
    this.context.push(_state);
  }

  get state(): S {
    return this._state;
  }

  set state(newState: S) {
    this._state = newState;
    this.emit("stateChange", newState);
  }

  update(partial: Partial<S> = {}) {
    this.state = this.state.update(partial);
    return this;
  }

  pushState() {
    this.context.push(this.state);
    return this;
  }

  popState(): S {
    this._state = this.context.pop() || this._state;
    return (this._state = this.context.pop() || this._state);
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
export class StateClass {
  update(partial: Partial<this> = {}): this {
    return Object.assign(Object.create(this), this, partial);
  }
}
