type StateListener<T> = (value: T, previous: T) => void;
type StateSetter<T> = T | ((previous: T) => T);

type UpdatableState<S> = {
  update(partial: Partial<S>): S;
};

function copyStateValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof Map) return new Map(value) as T;
  if (value instanceof Set) return new Set(value) as T;
  if (Array.isArray(value)) return value.slice() as T;

  // Preserve the prototype chain for class instances while copying own props.
  return Object.assign(Object.create(Object.getPrototypeOf(value)), value);
}

export class PaletteState<T> {
  private listeners: Set<StateListener<T>> = new Set();
  private current: T;

  constructor(initialValue: T) {
    this.current = copyStateValue(initialValue);
  }

  get(): T {
    return copyStateValue(this.current);
  }

  set(value: StateSetter<T>): T {
    const previous = this.current;
    const nextRaw =
      typeof value === "function" ? (value as (previous: T) => T)(copyStateValue(previous)) : value;
    this.current = copyStateValue(nextRaw);

    this.listeners.forEach(listener => listener(copyStateValue(this.current), copyStateValue(previous)));
    return this.get();
  }

  onChange(listener: StateListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): T {
    return copyStateValue(this.current);
  }

  restore(value: T): T {
    const previous = this.current;
    this.current = copyStateValue(value);
    this.listeners.forEach(listener => listener(copyStateValue(this.current), copyStateValue(previous)));
    return this.get();
  }
}

type PaletteContextSnapshot<S> = {
  state: S;
  atomStates: Map<PaletteState<unknown>, unknown>;
};

export class PaletteStateController<S extends UpdatableState<S>> {
  private contexts: PaletteContextSnapshot<S>[] = [];
  private atoms: Set<PaletteState<unknown>> = new Set();

  constructor(
    private readonly getState: () => S,
    private readonly setState: (state: S) => void,
  ) {}

  update(partial: Partial<S>): S {
    const next = this.getState().update(partial);
    this.setState(next);
    return next;
  }

  useState<T>(initialValue: T): PaletteState<T> {
    const atom = new PaletteState(initialValue);
    this.atoms.add(atom as PaletteState<unknown>);
    return atom;
  }

  pushCurrentContext(): void {
    this.contexts.push(this.createSnapshot());
  }

  popPreviousContext(): S | null {
    if (this.contexts.length <= 1) return null;

    this.contexts.pop();
    const previous = this.contexts.pop();
    if (!previous) return null;

    this.restoreSnapshot(previous);
    return previous.state;
  }

  clearContexts(): void {
    this.contexts = [];
  }

  hasPreviousContext(): boolean {
    return this.contexts.length > 1;
  }

  private createSnapshot(): PaletteContextSnapshot<S> {
    const atomStates = new Map<PaletteState<unknown>, unknown>();
    this.atoms.forEach(atom => {
      atomStates.set(atom, atom.snapshot());
    });

    return {
      state: this.getState().update({} as Partial<S>),
      atomStates,
    };
  }

  private restoreSnapshot(snapshot: PaletteContextSnapshot<S>): void {
    this.setState(snapshot.state.update({} as Partial<S>));
    snapshot.atomStates.forEach((value, atom) => {
      atom.restore(value);
    });
  }
}
