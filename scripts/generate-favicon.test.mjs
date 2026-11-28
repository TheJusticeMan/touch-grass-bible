import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createFaviconIco, createLogoIconPng } from './generate-favicon.mjs'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const SIZES = [16, 32, 48, 64, 128, 256]

describe('createFaviconIco', () => {
  it('embeds centered, transparent PNG sizes rasterized from logo.svg', async () => {
    const ico = await createFaviconIco()

    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(SIZES.length)

    for (const [index, size] of SIZES.entries()) {
      const entryOffset = 6 + index * 16
      const payloadSize = ico.readUInt32LE(entryOffset + 8)
      const payloadOffset = ico.readUInt32LE(entryOffset + 12)
      const actualWidth = ico[entryOffset] || 256
      const actualHeight = ico[entryOffset + 1] || 256
      const payload = ico.subarray(payloadOffset, payloadOffset + payloadSize)

      expect(actualWidth).toBe(size)
      expect(actualHeight).toBe(size)
      expect(ico.readUInt16LE(entryOffset + 4)).toBe(1)
      expect(ico.readUInt16LE(entryOffset + 6)).toBe(32)
      expect(payload.subarray(0, 8)).toEqual(PNG_SIGNATURE)
      expect(payload.readUInt32BE(16)).toBe(size)
      expect(payload.readUInt32BE(20)).toBe(size)

      const { data, info } = await sharp(payload).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect(data[3]).toBe(0)
      expect(
        data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3],
      ).toBeGreaterThan(0)
    }
  })
})

describe('createLogoIconPng', () => {
  it('renders the 512px logo.svg with its broad glow intact', async () => {
    const png = await createLogoIconPng()
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    expect(info.width).toBe(512)
    expect(info.height).toBe(512)

    const glowOffset = (256 * info.width + 96) * 4
    expect([...data.subarray(glowOffset, glowOffset + 3)]).toEqual([255, 255, 255])
    expect(data[glowOffset + 3]).toBeGreaterThan(0)
    expect(data[glowOffset + 3]).toBeLessThan(255)
  })
})
