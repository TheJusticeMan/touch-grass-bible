import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS } from "./config/TGAppSettings";

describe("TGAppSettings", () => {
  test("DEFAULT_SETTINGS style has Font as Fontserif", () => {
    expect(DEFAULT_SETTINGS.style.Font).toBe("Fontserif");
  });

  test("DEFAULT_SETTINGS has schemaVersion 1", () => {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(1);
  });
});
