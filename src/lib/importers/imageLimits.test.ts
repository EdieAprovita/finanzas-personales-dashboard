import { describe, expect, it } from 'vitest'
import {
  ImageBudgetError,
  MAX_IMAGE_CANVAS_PIXELS,
  assertImageDimensionsWithinBudget,
  computeOcrCanvasDimensions,
  readImageDimensions,
} from './imageLimits'

function png(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  new DataView(bytes.buffer).setUint32(8, 13)
  bytes.set([73, 72, 68, 82], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes.buffer
}

function jpeg(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0, 0x03, 0x01, 0x11, 0, 0xff, 0xd9])
  const view = new DataView(bytes.buffer)
  view.setUint16(7, height)
  view.setUint16(9, width)
  return bytes.buffer
}

function webp(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(30)
  bytes.set([82, 73, 70, 70], 0)
  bytes.set([87, 69, 66, 80], 8)
  bytes.set([86, 80, 56, 88], 12)
  const encodedWidth = width - 1
  const encodedHeight = height - 1
  bytes.set([encodedWidth & 0xff, (encodedWidth >> 8) & 0xff, (encodedWidth >> 16) & 0xff], 24)
  bytes.set([encodedHeight & 0xff, (encodedHeight >> 8) & 0xff, (encodedHeight >> 16) & 0xff], 27)
  return bytes.buffer
}

describe('imageLimits', () => {
  it('lee dimensiones PNG, JPEG y WebP desde la cabecera', () => {
    expect(readImageDimensions(png(760, 420))).toMatchObject({ width: 760, height: 420 })
    expect(readImageDimensions(jpeg(640, 480))).toMatchObject({ width: 640, height: 480 })
    expect(readImageDimensions(webp(1024, 768))).toMatchObject({ width: 1024, height: 768 })
  })

  it('rechaza una bomba de pixeles declarada en pocos bytes', () => {
    expect(() => assertImageDimensionsWithinBudget(readImageDimensions(png(100_000, 100_000)))).toThrow(ImageBudgetError)
  })

  it('rechaza dimensiones nulas, firmas ambiguas y cabeceras truncadas', () => {
    expect(() => readImageDimensions(png(0, 10))).toThrow(ImageBudgetError)
    expect(() => readImageDimensions(new Uint8Array([1, 2, 3]).buffer)).toThrow(ImageBudgetError)
    expect(() => readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xc0]).buffer)).toThrow(ImageBudgetError)
  })

  it('acota el lienzo incluso cuando el preprocesamiento intentaria ampliar la imagen', () => {
    const canvas = computeOcrCanvasDimensions({ width: 4000, height: 4000, pixels: 16_000_000 })
    expect(canvas.pixels).toBeLessThanOrEqual(MAX_IMAGE_CANVAS_PIXELS)
    expect(canvas.scale).toBeLessThan(1)
  })
})
