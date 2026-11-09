import { describe, expect, test, vi } from "vitest";
import van from "vanjs-core";
import ReadingPlansPlugin from "./ReadingPlans";
import type TouchGrassBibleApp from "../main";
import type { PluginMetadata } from "@touchgrass/framework";
import { VerseRef } from "../models/VerseRef";

function makeApp(): TouchGrassBibleApp {
  return {
    files: {
      loadConfigObject: vi.fn().mockResolvedValue({}),
      saveConfigObject: vi.fn().mockResolvedValue(undefined),
    },
    commandPalette: {
      commands: { add: vi.fn() },
      registerPalette: vi.fn(),
      unregisterPalette: vi.fn(),
    },
    verseState: { val: new VerseRef("GENESIS", 1, 1) },
    console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
  } as unknown as TouchGrassBibleApp;
}

function makePaletteState() {
  return {
    expanded: van.state(true),
    query: van.state(""),
    topCategory: van.state(""),
    maxItems: van.state(15),
  };
}

const manifest: PluginMetadata = {
  id: "reading-plans",
  name: "Reading Plans",
  description: "",
  version: "1.0",
};

function makePlugin(app = makeApp()) {
  const plugin = new ReadingPlansPlugin(app, manifest);
  // Always use a fresh settings copy to prevent test pollution via the shared defaultSettings reference
  plugin.settings = { activePlanId: "nt-in-30", dayIndex: 0, startDate: "2024-01-01" };
  return plugin;
}

describe("ReadingPlansPlugin - activePlan", () => {
  test("returns the built-in 'nt-in-30' plan by default", () => {
    const plugin = makePlugin();
    expect(plugin.activePlan).toBeDefined();
    expect(plugin.activePlan?.id).toBe("nt-in-30");
  });

  test("returns undefined when activePlanId does not match any plan", () => {
    const plugin = makePlugin();
    plugin.settings.activePlanId = "no-such-plan";
    expect(plugin.activePlan).toBeUndefined();
  });

  test("activePlan has the correct number of readings", () => {
    const plugin = makePlugin();
    expect(plugin.activePlan?.readings).toHaveLength(30);
  });
});

describe("ReadingPlansPlugin - todayReading", () => {
  test("returns the first reading when dayIndex is 0", () => {
    const plugin = makePlugin();
    plugin.settings.dayIndex = 0;
    expect(plugin.todayReading).toEqual(["Matthew", 1]);
  });

  test("returns the correct reading for a mid-plan dayIndex", () => {
    const plugin = makePlugin();
    plugin.settings.dayIndex = 6;
    // Reading 7 (index 6) of the NT-in-30 plan is Mark 1
    expect(plugin.todayReading?.[0]).toBe("Mark");
    expect(plugin.todayReading?.[1]).toBe(1);
  });

  test("returns the last reading for the maximum dayIndex", () => {
    const plugin = makePlugin();
    plugin.settings.dayIndex = 29;
    expect(plugin.todayReading).toEqual(["Revelation", 1]);
  });

  test("returns undefined when no active plan is set", () => {
    const plugin = makePlugin();
    plugin.settings.activePlanId = "nonexistent";
    expect(plugin.todayReading).toBeUndefined();
  });
});

describe("ReadingPlansPlugin - advance", () => {
  test("increments dayIndex by 1", async () => {
    const plugin = makePlugin();
    plugin.settings.dayIndex = 5;
    await plugin.advance();
    expect(plugin.settings.dayIndex).toBe(6);
  });

  test("does not exceed the last reading index", async () => {
    const plugin = makePlugin();
    plugin.settings.dayIndex = 29; // last index for nt-in-30 (30 readings, index 0-29)
    await plugin.advance();
    expect(plugin.settings.dayIndex).toBe(29);
  });

  test("advances from 0 to 1", async () => {
    const plugin = makePlugin();
    plugin.settings.dayIndex = 0;
    await plugin.advance();
    expect(plugin.settings.dayIndex).toBe(1);
  });

  test("is a no-op when no active plan exists", async () => {
    const plugin = makePlugin();
    plugin.settings.activePlanId = "nonexistent";
    plugin.settings.dayIndex = 3;
    await plugin.advance();
    expect(plugin.settings.dayIndex).toBe(3);
  });

  test("persists settings via saveSettings after advancing", async () => {
    const app = makeApp();
    const plugin = new ReadingPlansPlugin(app, manifest);
    plugin.settings.dayIndex = 0;
    await plugin.advance();
    const saveConfigObject = app.files.saveConfigObject as ReturnType<typeof vi.fn>;
    expect(saveConfigObject).toHaveBeenCalledOnce();
    expect(saveConfigObject).toHaveBeenCalledWith(manifest.id, expect.objectContaining({ dayIndex: 1 }));
  });

  test("does not persist settings when there is no active plan", async () => {
    const app = makeApp();
    const plugin = new ReadingPlansPlugin(app, manifest);
    plugin.settings.activePlanId = "nonexistent";
    await plugin.advance();
    expect(app.files.saveConfigObject).not.toHaveBeenCalled();
  });
});

describe("ReadingPlansPlugin - onload", () => {
  test("loads settings from storage on onload", async () => {
    const app = makeApp();
    (app.files.loadConfigObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      activePlanId: "nt-in-30",
      dayIndex: 10,
      startDate: "2024-06-01",
    });
    const plugin = new ReadingPlansPlugin(app, manifest);
    await plugin.load();
    expect(plugin.settings.dayIndex).toBe(10);
    expect(plugin.settings.startDate).toBe("2024-06-01");
  });

  test("uses default settings when storage is empty", async () => {
    const app = makeApp();
    (app.files.loadConfigObject as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const plugin = new ReadingPlansPlugin(app, manifest);
    await plugin.load();
    expect(plugin.settings.activePlanId).toBe("nt-in-30");
    expect(plugin.settings.dayIndex).toBe(0);
  });

  test("registers a palette that opens readings with canonical VerseRef book names", async () => {
    const app = makeApp();
    const plugin = new ReadingPlansPlugin(app, manifest);
    await plugin.load();

    const registerPalette = app.commandPalette.registerPalette as ReturnType<typeof vi.fn>;
    const paletteArgs = registerPalette.mock.calls[0][0] as {
      id: string;
      cfn: (args: { id: string; state: ReturnType<typeof makePaletteState> }) => {
        renderItem: (item: [string, number]) => { click?: () => boolean };
      };
    };

    const category = paletteArgs.cfn({ id: paletteArgs.id, state: makePaletteState() });
    const item = category.renderItem(["Matthew", 1]);

    expect(item.click?.()).toBe(true);
    expect(app.verseState.val.book).toBe("MATTHEW");
    expect(app.verseState.val.toOSIS()).toBe("Matt.1.1");
  });

  test("opening today's reading advances the plan after navigation", async () => {
    const app = makeApp();
    const plugin = new ReadingPlansPlugin(app, manifest);
    const advanceSpy = vi.spyOn(plugin, "advance").mockResolvedValue(undefined);
    await plugin.load();

    const registerPalette = app.commandPalette.registerPalette as ReturnType<typeof vi.fn>;
    const paletteArgs = registerPalette.mock.calls[0][0] as {
      id: string;
      cfn: (args: { id: string; state: ReturnType<typeof makePaletteState> }) => {
        renderItem: (item: [string, number]) => { click?: () => boolean };
      };
    };

    const category = paletteArgs.cfn({ id: paletteArgs.id, state: makePaletteState() });
    const item = category.renderItem(["Matthew", 1]);
    item.click?.();

    expect(advanceSpy).toHaveBeenCalledOnce();
  });
});
