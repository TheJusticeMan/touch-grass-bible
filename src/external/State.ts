// external/State.ts

import { ETarget } from "./Event";

/**
 * Represents a state with a name and a timestamp.
 *
 * @remarks
 * This class is used to encapsulate a state, identified by a string `name`
 * and associated with a specific `time` (defaults to the current date and time).
 *
 * @example
 * ```typescript
 * const state = new State("active");
 * ```
 *
 * @param name - The name of the state.
 * @param time - The timestamp associated with the state. Defaults to the current date and time.
 */
class State {
  constructor(public name: string = "", public time = new Date()) {}
  update(partial: Partial<State> = {}): State {
    return Object.assign(Object.create(this), this, partial);
  }
}

/**
 * Abstract class representing a stack-based state manager.
 *
 * `StateStack` manages a stack of `State` objects, providing methods to push, pop, and reset states.
 * It emits events on state changes and keeps track of the current active state.
 *
 * @extends ETarget
 *
 * @property {State[]} stack - Internal stack holding the states.
 * @property {State} state - The current active state.
 *
 * @method push
 * Pushes a new state onto the stack, emits a "push" event, and sets it as the current state.
 * @param {State} state - The state to push onto the stack.
 *
 * @method pop
 * Pops the top state from the stack, emits a "pop" event, and updates the current state.
 * @returns {State | undefined} The new current state after popping, or a new `State` if the stack is empty.
 *
 * @method reset
 * Clears the stack and emits a "reset" event.
 *
 * @getter current
 * Gets the current (top) state on the stack, or `undefined` if the stack is empty.
 *
 * @getter length
 * Gets the number of states currently in the stack.
 */
abstract class StateStack extends ETarget {
  private stack: State[] = [];
  state: State = new State();

  push(state: State): void {
    console.log(`Pushing state: ${state.name} at ${state.time}`);
    this.stack.push(state);
    this.emit("push", state);
    this.state = state;
  }

  pop(): State | undefined {
    this.stack.pop();
    this.state = this.stack.pop() || new State();
    if (this.state) this.emit("pop", this.state);
    console.log(`Popped state: ${this.state?.name} at ${this.state?.time}`);
    return this.state;
  }

  reset(): void {
    this.stack = [];
    this.emit("reset");
  }

  get current(): State | undefined {
    return this.stack.at(-1);
  }

  get length(): number {
    return this.stack.length;
  }
}

/**
 * Manages multiple named state stacks and synchronizes their changes with browser navigation history.
 *
 * `GlobalState` extends `ETarget` to provide event-driven state management for multiple `StateStack` instances.
 * It listens for browser navigation events (back/forward) and updates the relevant state stack accordingly.
 *
 * Key Features:
 * - Maintains a map of named `StateStack` instances.
 * - Synchronizes stack changes with browser history using the History API.
 * - Emits and listens to "push", "pop", and "reset" events for each stack.
 * - Provides methods to add, retrieve, and remove stacks.
 *
 * Events:
 * - `"push"`: Triggered when a state is pushed onto a stack; updates browser history.
 * - `"pop"`: Triggered when a state is popped from a stack; updates internal stack tracking.
 * - `"reset"`: Triggered when a stack is reset; removes all instances from internal tracking.
 *
 * Usage:
 * - Use `addStack` to register a new `StateStack`.
 * - Use `getStack` to retrieve a stack by name.
 * - Use `removeStack` to remove and reset a stack.
 *
 * @extends ETarget
 */
class GlobalState extends ETarget {
  private stacks = new Map<string, StateStack>();
  private stackNames: string[] = [];

  constructor() {
    super();
    // Sync with browser back/forward navigation
    window.addEventListener("popstate", () => {
      console.log("Browser back/forward navigation detected");
      const name = this.stackNames.at(-1) || "";
      const stack = this.stacks.get(name);
      if (stack?.current) stack.pop();
    });

    // Keep history in sync with state pushes
    this.on("push", (name: string) => {
      this.stackNames.push(name);
      history.pushState({ name }, "", "");
    });

    // Remove from stackNames on pop
    this.on("pop", (name: string) => {
      const index = this.stackNames.lastIndexOf(name);
      if (index !== -1) this.stackNames.splice(index, 1);
    });

    // Remove all instances on reset
    this.on("reset", (name: string) => {
      this.stackNames = this.stackNames.filter(n => n !== name);
    });
  }

  addStack(stack: StateStack): void {
    const name = stack.constructor.name;
    if (this.stacks.has(name)) {
      console.warn(`Stack "${name}" already exists.`);
      return;
    }
    this.stacks.set(name, stack);
    // Forward stack events to GlobalState
    stack.on("push", () => this.emit("push", name));
    stack.on("pop", () => this.emit("pop", name));
    stack.on("reset", () => this.emit("reset", name));
  }

  getStack(name: string): StateStack | undefined {
    return this.stacks.get(name);
  }

  removeStack(stack: StateStack): boolean {
    const name = stack.constructor.name;
    stack.reset();
    this.stacks.delete(name);
    return true;
  }
}

// Create singleton instance
const globalState = new GlobalState();

export { globalState, State, StateStack };
