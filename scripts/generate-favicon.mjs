import { writeFileSync } from 'node:fs'

const SIZE = 32
const ROW_BYTES = SIZE * 4
const MASK_ROW_BYTES = SIZE / 8
const BACKGROUND = { red: 45, green: 105, blue: 75 }
const CROSS = { red: 250, green: 250, blue: 245 }

function isInsideRoundedSquare(x, y) {
  const radius = 6
  const centerX = Math.max(radius, Math.min(SIZE - radius - 1, x))
  const centerY = Math.max(radius, Math.min(SIZE - radius - 1, y))
  const dx = x - centerX
  const dy = y - centerY
  return dx * dx + dy * dy <= radius * radius
}

function isCrossPixel(x, y) {
  const vertical = x >= 13 && x <= 18 && y >= 6 && y <= 25
  const horizontal = x >= 7 && x <= 24 && y >= 10 && y <= 15
  return vertical || horizontal
}

export function createFaviconIco() {
  const xorBitmap = Buffer.alloc(SIZE * ROW_BYTES)
  const andMask = Buffer.alloc(SIZE * MASK_ROW_BYTES)

  for (let y = 0; y < SIZE; y += 1) {
    const dibY = SIZE - 1 - y
    for (let x = 0; x < SIZE; x += 1) {
      const pixelOffset = dibY * ROW_BYTES + x * 4
      const maskOffset = dibY * MASK_ROW_BYTES + Math.floor(x / 8)
      const opaque = isInsideRoundedSquare(x, y)

      if (!opaque) {
        andMask[maskOffset] |= 0x80 >> (x % 8)
        continue
      }

      const color = isCrossPixel(x, y) ? CROSS : BACKGROUND
      xorBitmap[pixelOffset] = color.blue
      xorBitmap[pixelOffset + 1] = color.green
      xorBitmap[pixelOffset + 2] = color.red
      xorBitmap[pixelOffset + 3] = 255
    }
  }

  const dibHeader = Buffer.alloc(40)
  dibHeader.writeUInt32LE(40, 0)
  dibHeader.writeInt32LE(SIZE, 4)
  dibHeader.writeInt32LE(SIZE * 2, 8)
  dibHeader.writeUInt16LE(1, 12)
  dibHeader.writeUInt16LE(32, 14)
  dibHeader.writeUInt32LE(xorBitmap.length + andMask.length, 20)

  const image = Buffer.concat([dibHeader, xorBitmap, andMask])
  const icoHeader = Buffer.alloc(22)
  icoHeader.writeUInt16LE(1, 2)
  icoHeader.writeUInt16LE(1, 4)
  icoHeader[6] = SIZE
  icoHeader[7] = SIZE
  icoHeader.writeUInt16LE(1, 10)
  icoHeader.writeUInt16LE(32, 12)
  icoHeader.writeUInt32LE(image.length, 14)
  icoHeader.writeUInt32LE(icoHeader.length, 18)

  return Buffer.concat([icoHeader, image])
}

export function generateFaviconIco(filePath) {
  writeFileSync(filePath, createFaviconIco())
}
