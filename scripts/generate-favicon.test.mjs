import { describe, expect, it } from 'vitest'

import { createFaviconIco } from './generate-favicon.mjs'

describe('createFaviconIco', () => {
  it('creates a single-image 32-bit favicon ICO', () => {
    const ico = createFaviconIco()

    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(1)
    expect([...ico.subarray(6, 8)]).toEqual([32, 32])
    expect(ico.readUInt16LE(10)).toBe(1)
    expect(ico.readUInt16LE(12)).toBe(32)
    expect(ico.readUInt32LE(18)).toBe(22)
    expect(ico.readUInt32LE(22)).toBe(40)
    expect(ico.readInt32LE(26)).toBe(32)
    expect(ico.readInt32LE(30)).toBe(64)

    const xorOffset = 22 + 40
    const pixelAt = (x, y) => xorOffset + ((31 - y) * 32 + x) * 4
    expect([...ico.subarray(pixelAt(16, 16), pixelAt(16, 16) + 4)]).toEqual([245, 250, 250, 255])
    expect([...ico.subarray(pixelAt(2, 16), pixelAt(2, 16) + 4)]).toEqual([75, 105, 45, 255])
    expect([...ico.subarray(pixelAt(0, 0), pixelAt(0, 0) + 4)]).toEqual([0, 0, 0, 0])
  })
})
