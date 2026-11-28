import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SIZES = [16, 32, 48, 64, 128, 256]
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const LOGO_PATH = fileURLToPath(new URL('../assets/logo.svg', import.meta.url))
const LOGO_SVG = readFileSync(LOGO_PATH)

async function renderLogoAtSize(size) {
  const padding = Math.max(1, Math.round(size / 16))
  const contentSize = size - padding * 2

  return sharp(LOGO_SVG)
    .trim()
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: TRANSPARENT,
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer()
}

export async function createFaviconIco() {
  const pngImages = await Promise.all(SIZES.map(renderLogoAtSize))
  const directory = Buffer.alloc(6 + SIZES.length * 16)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(SIZES.length, 4)

  let imageOffset = directory.length
  SIZES.forEach((size, index) => {
    const entryOffset = 6 + index * 16
    const png = pngImages[index]
    directory[entryOffset] = size === 256 ? 0 : size
    directory[entryOffset + 1] = size === 256 ? 0 : size
    directory.writeUInt16LE(1, entryOffset + 4)
    directory.writeUInt16LE(32, entryOffset + 6)
    directory.writeUInt32LE(png.length, entryOffset + 8)
    directory.writeUInt32LE(imageOffset, entryOffset + 12)
    imageOffset += png.length
  })

  return Buffer.concat([directory, ...pngImages])
}

export async function generateFaviconIco(filePath) {
  writeFileSync(filePath, await createFaviconIco())
}

export async function createLogoIconPng() {
  return sharp(LOGO_SVG).png().toBuffer()
}

export async function generateLogoIconPng(filePath) {
  writeFileSync(filePath, await createLogoIconPng())
}
