const MONKEYPATCHED_METHOD = Symbol("workspace.monkeypatched.method");
const MONKEYPATCHED_CLASS = Symbol("workspace.monkeypatched.class");

export let workspaceMethodLifecycleLogs = "";

function appendWorkspaceMethodLog(message: string): void {
  workspaceMethodLifecycleLogs = workspaceMethodLifecycleLogs
    ? `${workspaceMethodLifecycleLogs}\n${message}`
    : message;
}

export function getWorkspaceMethodLifecycleLogs(): string {
  return workspaceMethodLifecycleLogs;
}

export function clearWorkspaceMethodLifecycleLogs(): void {
  workspaceMethodLifecycleLogs = "";
}

const workspaceDebugWindow =
  typeof window === "undefined"
    ? null
    : (window as Window & {
        getWorkspaceMethodLifecycleLogs?: () => string;
        clearWorkspaceMethodLifecycleLogs?: () => void;
      });

if (workspaceDebugWindow) {
  workspaceDebugWindow.getWorkspaceMethodLifecycleLogs = getWorkspaceMethodLifecycleLogs;
  workspaceDebugWindow.clearWorkspaceMethodLifecycleLogs = clearWorkspaceMethodLifecycleLogs;
}

type PrototypeMethod = (this: unknown, ...args: unknown[]) => unknown;
type PatchableClass = {
  prototype: object;
  [MONKEYPATCHED_CLASS]?: boolean;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }
  const thenValue = (value as { then?: unknown }).then;
  return typeof thenValue === "function";
}

function monkeypatchPrototypeMethodsWithLifecycleLogs(className: string, prototype: object): void {
  const descriptors = Object.getOwnPropertyDescriptors(prototype);
  for (const [methodName, descriptor] of Object.entries(descriptors)) {
    if (methodName === "constructor") {
      continue;
    }
    if (typeof descriptor.value !== "function") {
      continue;
    }

    const original = descriptor.value as PrototypeMethod & { [MONKEYPATCHED_METHOD]?: boolean };
    if (original[MONKEYPATCHED_METHOD]) {
      continue;
    }

    const wrapped: PrototypeMethod & { [MONKEYPATCHED_METHOD]?: boolean } = function (
      this: unknown,
      ...args: unknown[]
    ) {
      const label = `${className}.${methodName}`;
      const startMessage = `[WorkspaceTrace] START ${label}`;
      appendWorkspaceMethodLog(startMessage);
      console.log(startMessage);
      try {
        const result = original.apply(this, args);
        if (isPromiseLike(result)) {
          return result.then(
            value => {
              const endMessage = `[WorkspaceTrace] END ${label}`;
              appendWorkspaceMethodLog(endMessage);
              console.log(endMessage);
              return value;
            },
            error => {
              const errorMessage = `[WorkspaceTrace] ERROR ${label}: ${String(error)}`;
              appendWorkspaceMethodLog(errorMessage);
              console.error(errorMessage, error);
              const endMessage = `[WorkspaceTrace] END ${label}`;
              appendWorkspaceMethodLog(endMessage);
              console.log(endMessage);
              throw error;
            },
          );
        }
        const endMessage = `[WorkspaceTrace] END ${label}`;
        appendWorkspaceMethodLog(endMessage);
        console.log(endMessage);
        return result;
      } catch (error) {
        const errorMessage = `[WorkspaceTrace] ERROR ${label}: ${String(error)}`;
        appendWorkspaceMethodLog(errorMessage);
        console.error(errorMessage, error);
        const endMessage = `[WorkspaceTrace] END ${label}`;
        appendWorkspaceMethodLog(endMessage);
        console.log(endMessage);
        throw error;
      }
    };

    wrapped[MONKEYPATCHED_METHOD] = true;
    Object.defineProperty(prototype, methodName, {
      ...descriptor,
      value: wrapped,
    });
  }
}

function monkeypatchClassMethodsWithLifecycleLogs(className: string, klass: PatchableClass): void {
  if (klass[MONKEYPATCHED_CLASS]) {
    return;
  }
  monkeypatchPrototypeMethodsWithLifecycleLogs(className, klass.prototype);
  klass[MONKEYPATCHED_CLASS] = true;
}

export function monkeypatchAllWorkspaceMethods(
  classes: Array<[className: string, klass: PatchableClass]>,
): void {
  classes.forEach(([className, klass]) => monkeypatchClassMethodsWithLifecycleLogs(className, klass));
}
