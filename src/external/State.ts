import { ETarget } from "./Event";

export class MState<S extends StateClass> extends ETarget<{
  stateChange: S;
  [key: string]: unknown;
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

export class StateClass {
  update(partial: Partial<this> = {}): this {
    return Object.assign(Object.create(this), this, partial);
  }
}
