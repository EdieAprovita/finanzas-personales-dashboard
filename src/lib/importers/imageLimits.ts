export const MAX_IMAGE_SOURCE_PIXELS = 20_000_000
export const MAX_IMAGE_CANVAS_PIXELS = 8_000_000
export const MAX_IMAGE_BATCH_PIXELS = 40_000_000
export const MAX_IMAGE_SIDE = 16_384

export interface ImageDimensions {
  width: number
  height: number
  pixels: number
}

export interface OcrCanvasDimensions extends ImageDimensions {
  scale: number
}

export class ImageBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageBudgetError'
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readPng(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return undefined
  if (ascii(bytes, 12, 4) !== 'IHDR' || view.getUint32(8) !== 13) throw new ImageBudgetError('La cabecera PNG no es valida.')
  return dimensions(view.getUint32(16), view.getUint32(20))
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2

  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break

    const marker = bytes[offset]!
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) break

    const segmentLength = view.getUint16(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw new ImageBudgetError('La cabecera JPEG esta truncada.')
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) throw new ImageBudgetError('La cabecera JPEG no contiene dimensiones validas.')
      return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3))
    }
    if (marker === 0xda) break
    offset += segmentLength
  }

  throw new ImageBudgetError('No se encontraron dimensiones JPEG antes de decodificar la imagen.')
}

function readWebp(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined
  const chunk = ascii(bytes, 12, 4)

  if (chunk === 'VP8X') {
    if (bytes.length < 30) throw new ImageBudgetError('La cabecera WebP esta truncada.')
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16)
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16)
    return dimensions(width, height)
  }

  if (chunk === 'VP8 ') {
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new ImageBudgetError('La cabecera WebP VP8 no es valida.')
    }
    return dimensions(view.getUint16(28, true) & 0x3fff, view.getUint16(26, true) & 0x3fff)
  }

  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) throw new ImageBudgetError('La cabecera WebP VP8L no es valida.')
    const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8)
    const height = 1 + ((bytes[22]! & 0xc0) >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10)
    return dimensions(width, height)
  }

  throw new ImageBudgetError('El formato interno de WebP no es compatible con OCR local.')
}

function dimensions(width: number, height: number): ImageDimensions {
  const pixels = width * height
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(pixels)) {
    throw new ImageBudgetError('La imagen declara dimensiones invalidas.')
  }
  return { width, height, pixels }
}

export function readImageDimensions(buffer: ArrayBuffer): ImageDimensions {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const parsed = readPng(bytes, view) ?? readJpeg(bytes, view) ?? readWebp(bytes, view)
  if (!parsed) throw new ImageBudgetError('La firma de la imagen no corresponde a PNG, JPEG o WebP.')
  return parsed
}

export function assertImageDimensionsWithinBudget(value: ImageDimensions): ImageDimensions {
  if (value.width > MAX_IMAGE_SIDE || value.height > MAX_IMAGE_SIDE || value.pixels > MAX_IMAGE_SOURCE_PIXELS) {
    throw new ImageBudgetError(
      `La imagen excede el limite seguro para OCR (${MAX_IMAGE_SIDE}px por lado y ${MAX_IMAGE_SOURCE_PIXELS.toLocaleString('en-US')} pixeles).`,
    )
  }
  return value
}

export async function assertImageOcrBudget(file: File): Promise<ImageDimensions> {
  return assertImageDimensionsWithinBudget(readImageDimensions(await file.arrayBuffer()))
}

export function assertImageBatchBudget(images: ImageDimensions[]): void {
  const total = images.reduce((sum, image) => sum + image.pixels, 0)
  if (!Number.isSafeInteger(total) || total > MAX_IMAGE_BATCH_PIXELS) {
    throw new ImageBudgetError(`El lote excede el limite seguro de ${MAX_IMAGE_BATCH_PIXELS.toLocaleString('en-US')} pixeles.`)
  }
}

export function computeOcrCanvasDimensions(image: ImageDimensions): OcrCanvasDimensions {
  const longestSide = Math.max(image.width, image.height)
  const requestedScale = Math.min(3, Math.max(1.35, 2200 / longestSide))
  const pixelScale = Math.sqrt(MAX_IMAGE_CANVAS_PIXELS / image.pixels)
  const scale = Math.min(requestedScale, pixelScale)
  const width = Math.max(1, Math.floor(image.width * scale))
  const height = Math.max(1, Math.floor(image.height * scale))
  const pixels = width * height
  if (pixels > MAX_IMAGE_CANVAS_PIXELS) throw new ImageBudgetError('El lienzo OCR excede el presupuesto de pixeles.')
  return { width, height, pixels, scale }
}
