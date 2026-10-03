export const MAX_PDF_PAGES = 60
export const MAX_PDF_OCR_PAGES = 20
const MAX_OCR_PAGE_PIXELS = 8_000_000
const MAX_OCR_TOTAL_PIXELS = 40_000_000

export function assertPdfPageBudget(pages: number, ocr = false): void {
  const limit = ocr ? MAX_PDF_OCR_PAGES : MAX_PDF_PAGES
  if (!Number.isInteger(pages) || pages < 1 || pages > limit) {
    throw new Error(`El PDF excede el limite de ${limit} paginas${ocr ? ' para OCR' : ''}. Divide el documento antes de importarlo.`)
  }
}

export function assertPdfOcrPixelBudget(width: number, height: number, usedPixels: number): number {
  const pixels = width * height
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(pixels) || pixels > MAX_OCR_PAGE_PIXELS
    || !Number.isSafeInteger(usedPixels) || usedPixels < 0 || usedPixels + pixels > MAX_OCR_TOTAL_PIXELS) {
    throw new Error('El PDF excede el limite de resolucion o trabajo para OCR. Reduce la resolucion o divide el documento.')
  }
  return usedPixels + pixels
}
