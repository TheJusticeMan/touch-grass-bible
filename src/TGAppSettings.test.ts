import { describe, test, expect } from "vitest"
import { DEFAULT_SETTINGS } from "./TGAppSettings"

describe("TGAppSettings", () => {
  test("DEFAULT_SETTINGS has myNotes as empty array", () => {
    expect(DEFAULT_SETTINGS.myNotes).toEqual([])
  })

  test("DEFAULT_SETTINGS has Start Up Verses with 6 entries", () => {
    expect(DEFAULT_SETTINGS.Bookmarks["Start Up Verses"]).toHaveLength(6)
  })

  test("DEFAULT_SETTINGS style has Font as Fontserif", () => {
    expect(DEFAULT_SETTINGS.style.Font).toBe("Fontserif")
  })

  test("DEFAULT_SETTINGS has schemaVersion 1", () => {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(1)
  })

  test("DEFAULT_SETTINGS ExtraNotes is empty", () => {
    expect(DEFAULT_SETTINGS.ExtraNotes).toEqual([])
  })
})
