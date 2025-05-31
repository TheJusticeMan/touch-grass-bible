// external/State.ts

import { ETarget } from "./Event";

// Define State with PascalCase
class State {
  constructor(public name: string = "", public time = new Date()) {}
}

// Use PascalCase and internalize as private if desired
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
    return this.stack[this.stack.length - 1];
  }

  get length(): number {
    return this.stack.length;
  }
}

// GlobalState manages multiple stacks and syncs with browser history
class GlobalState extends ETarget {
  private stacks = new Map<string, StateStack>();
  private stackNames: string[] = [];

  constructor() {
    super();
    // Sync with browser back/forward navigation
    window.addEventListener("popstate", () => {
      console.log("Browser back/forward navigation detected");
      const name = this.stackNames[this.stackNames.length - 1];
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
