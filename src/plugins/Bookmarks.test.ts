import { describe, test, expect } from "vitest"

// convertTopicDate is a static pure function on VerseListCategory.
// We mirror the implementation here to test the logic without pulling in the full plugin
// (which depends on DOM-heavy Command Palette imports).

function getLocalDateStrings(): { today: string; yesterday: string } {
  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  const now = new Date()
  return {
    today: formatDate(now),
    yesterday: formatDate(new Date(now.getTime() - 86400000)),
  }
}

function convertTopicDate(str: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.toTitleCase()

  const inputDate = new Date(str)
  const { today, yesterday } = getLocalDateStrings()

  if (str === today) return "Today"
  if (str === yesterday) return "Yesterday"
  if (inputDate.getTime() >= Date.now() - 6 * 86400000)
    return inputDate.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
    })
  return inputDate.toDateString()
}

describe("convertTopicDate", () => {
  test("returns 'Today' for today's date string", () => {
    const { today } = getLocalDateStrings()
    expect(convertTopicDate(today)).toBe("Today")
  })

  test("returns 'Yesterday' for yesterday's date string", () => {
    const { yesterday } = getLocalDateStrings()
    expect(convertTopicDate(yesterday)).toBe("Yesterday")
  })

  test("title-cases non-date strings", () => {
    expect(convertTopicDate("faith hope love")).toBe("Faith Hope Love")
  })

  test("title-cases multi-word strings", () => {
    expect(convertTopicDate("start up verses")).toBe("Start Up Verses")
  })

  test("returns toDateString() for old dates", () => {
    const oldDate = "2020-01-01"
    const result = convertTopicDate(oldDate)
    expect(result).toBe(new Date(oldDate).toDateString())
  })

  test("does not mistake non-ISO strings as dates", () => {
    expect(convertTopicDate("2020-1-1")).toBe("2020-1-1".toTitleCase())
    expect(convertTopicDate("Favorites")).toBe("Favorites")
  })
})
