import { describe, expect, it } from 'vitest'
import { assertPdfPageBudget, assertPdfOcrPixelBudget, MAX_PDF_PAGES, MAX_PDF_OCR_PAGES } from './pdfLimits'

describe('PDF work budgets', () => {
  it('accepts supported documents and rejects excessive page counts', () => {
    expect(() => assertPdfPageBudget(MAX_PDF_PAGES)).not.toThrow()
    expect(() => assertPdfPageBudget(MAX_PDF_PAGES + 1)).toThrow('60 paginas')
    expect(() => assertPdfPageBudget(MAX_PDF_OCR_PAGES + 1, true)).toThrow('20 paginas')
    for (const pages of [0, -1, 1.5, Infinity, NaN]) expect(() => assertPdfPageBudget(pages)).toThrow()
  })
  it('rejects oversized and cumulative canvas work before allocation', () => {
    expect(assertPdfOcrPixelBudget(2000, 2000, 0)).toBe(4_000_000)
    expect(() => assertPdfOcrPixelBudget(10000, 10000, 0)).toThrow('resolucion')
    expect(() => assertPdfOcrPixelBudget(2000, 2000, 40_000_000)).toThrow('resolucion')
    for (const width of [0, -1, 1.5, Infinity, NaN]) expect(() => assertPdfOcrPixelBudget(width, 100, 0)).toThrow()
  })
})
