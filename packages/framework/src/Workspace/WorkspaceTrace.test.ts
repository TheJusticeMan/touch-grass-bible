import { describe, test, expect, beforeEach } from "vitest";
import {
  getWorkspaceMethodLifecycleLogs,
  clearWorkspaceMethodLifecycleLogs,
  monkeypatchAllWorkspaceMethods,
} from "./WorkspaceTrace";

describe("WorkspaceTrace utilities", () => {
  beforeEach(() => {
    clearWorkspaceMethodLifecycleLogs();
  });

  test("getWorkspaceMethodLifecycleLogs returns empty string initially", () => {
    expect(getWorkspaceMethodLifecycleLogs()).toBe("");
  });

  test("clearWorkspaceMethodLifecycleLogs resets the log to empty string", () => {
    // Patch a class so the log gets populated
    class LoggingTestClass {
      greet() {
        return "hello";
      }
    }
    monkeypatchAllWorkspaceMethods([["LoggingTestClass", LoggingTestClass as never]]);
    new LoggingTestClass().greet();
    // After patching there should be log entries
    const logBefore = getWorkspaceMethodLifecycleLogs();
    expect(logBefore.length).toBeGreaterThan(0);

    clearWorkspaceMethodLifecycleLogs();
    expect(getWorkspaceMethodLifecycleLogs()).toBe("");
  });

  test("monkeypatchAllWorkspaceMethods logs START and END for a sync method", () => {
    class TargetClass {
      compute() {
        return 42;
      }
    }
    monkeypatchAllWorkspaceMethods([["TargetClass", TargetClass as never]]);
    new TargetClass().compute();
    const log = getWorkspaceMethodLifecycleLogs();
    expect(log).toContain("[WorkspaceTrace] START TargetClass.compute");
    expect(log).toContain("[WorkspaceTrace] END TargetClass.compute");
  });

  test("monkeypatchAllWorkspaceMethods logs START and END for an async method", async () => {
    class AsyncClass {
      async fetch() {
        return "data";
      }
    }
    monkeypatchAllWorkspaceMethods([["AsyncClass", AsyncClass as never]]);
    await new AsyncClass().fetch();
    const log = getWorkspaceMethodLifecycleLogs();
    expect(log).toContain("[WorkspaceTrace] START AsyncClass.fetch");
    expect(log).toContain("[WorkspaceTrace] END AsyncClass.fetch");
  });

  test("monkeypatchAllWorkspaceMethods logs ERROR for a method that throws", () => {
    class FailingClass {
      boom() {
        throw new Error("kaboom");
      }
    }
    monkeypatchAllWorkspaceMethods([["FailingClass", FailingClass as never]]);
    expect(() => new FailingClass().boom()).toThrow("kaboom");
    const log = getWorkspaceMethodLifecycleLogs();
    expect(log).toContain("[WorkspaceTrace] ERROR FailingClass.boom");
    expect(log).toContain("kaboom");
    expect(log).toContain("[WorkspaceTrace] END FailingClass.boom");
  });

  test("monkeypatchAllWorkspaceMethods logs ERROR for an async method that rejects", async () => {
    class AsyncFailingClass {
      async badFetch() {
        throw new Error("async error");
      }
    }
    monkeypatchAllWorkspaceMethods([["AsyncFailingClass", AsyncFailingClass as never]]);
    await expect(new AsyncFailingClass().badFetch()).rejects.toThrow("async error");
    const log = getWorkspaceMethodLifecycleLogs();
    expect(log).toContain("[WorkspaceTrace] ERROR AsyncFailingClass.badFetch");
    expect(log).toContain("[WorkspaceTrace] END AsyncFailingClass.badFetch");
  });

  test("monkeypatchAllWorkspaceMethods is idempotent (no double-wrapping)", () => {
    class IdempotentClass {
      run() {
        return 1;
      }
    }
    monkeypatchAllWorkspaceMethods([["IdempotentClass", IdempotentClass as never]]);
    monkeypatchAllWorkspaceMethods([["IdempotentClass", IdempotentClass as never]]);
    new IdempotentClass().run();
    const log = getWorkspaceMethodLifecycleLogs();
    // There should be exactly one START/END pair, not two
    const startCount = (log.match(/START IdempotentClass\.run/g) || []).length;
    expect(startCount).toBe(1);
  });

  test("multiple log entries are separated by newlines", () => {
    class MultiClass {
      a() {}
      b() {}
    }
    monkeypatchAllWorkspaceMethods([["MultiClass", MultiClass as never]]);
    const instance = new MultiClass();
    instance.a();
    instance.b();
    const log = getWorkspaceMethodLifecycleLogs();
    expect(log).toContain("\n");
  });
});
