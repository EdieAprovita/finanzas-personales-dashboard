import { describe, expect, it, vi } from 'vitest'

const getDocumentMock = vi.hoisted(() => vi.fn())
const ocrWorker = vi.hoisted(() => ({ setParameters: vi.fn(), terminate: vi.fn(), recognize: vi.fn().mockResolvedValue({ data: { text: 'Banco demo Estado de cuenta Saldo final 100', confidence: 90 } }) }))
vi.mock('tesseract.js', () => ({ createWorker: async () => ocrWorker }))

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: getDocumentMock }))

import type { FinancialProfile } from '../../domain/types'
import { importFinancialFile } from './pipeline'

function profile(): FinancialProfile {
  return {
    accounts: [],
    budgets: [],
    debts: [],
    description: '',
    goals: [],
    grossMonthlyIncome: 0,
    id: 'pdf-test',
    importedDocuments: [],
    monthlySnapshots: [],
    name: 'PDF test',
    netMonthlyIncome: 0,
    reportingCurrency: 'MXN',
    schemaVersion: 2,
    transactions: [],
  }
}

function item(str: string, x: number, y: number): { height: number; str: string; transform: number[]; width: number } {
  return { height: 10, str, transform: [1, 0, 0, 1, x, y], width: str.length * 5 }
}

describe('importFinancialFile PDF', () => {
  it('keeps coordinate-extracted card rows in review until reconciliation is confirmed', async () => {
    getDocumentMock.mockReturnValue({
      destroy: vi.fn(),
      promise: Promise.resolve({
        getPage: async () => ({
          cleanup: vi.fn(),
            getTextContent: async () => ({
            items: [
              item('Estado de cuenta de Tarjeta de Crédito', 30, 760),
              item('Saldo anterior', 30, 730),
              item('$9,000.00', 150, 730),
              item('Saldo actual', 30, 710),
              item('$8,624.50', 150, 710),
              item('Fecha', 30, 680),
              item('Descripción', 110, 680),
              item('Cargo', 330, 680),
              item('Pago', 410, 680),
              item('Saldo', 590, 680),
              item('15/06/2026', 30, 660),
              item('Comercio de prueba', 110, 660),
              item('125.50', 330, 660),
              item('9124.50', 590, 660),
              item('16/06/2026', 30, 640),
              item('Pago recibido', 110, 640),
              item('500.00', 410, 640),
              item('8624.50', 590, 640),
            ],
          }),
        }),
        numPages: 1,
      }),
    })

    const result = await importFinancialFile(
      profile(),
      new File(['synthetic pdf'], 'estado-tarjeta.pdf', { type: 'application/pdf' }),
    )

    expect(result.document).toMatchObject({
      extractedRows: 2,
      kind: 'credit_card_statement',
      status: 'needs_review',
    })
    expect(result.document.extracted).toMatchObject({
      cardMovementExtractionMethod: 'pdf_layout_coordinates',
      cardMovementRowCount: 2,
    })
    expect(result.profile.transactions).toEqual([])
  })

})

it('rejects excessive pages before reading any page and destroys the PDF task', async () => {
  const getPage = vi.fn()
  const destroy = vi.fn()
  getDocumentMock.mockReturnValue({ promise: Promise.resolve({ numPages: 61, getPage }), destroy })
  await expect(importFinancialFile(profile(), new File(['pdf'], 'large.pdf', { type: 'application/pdf' }))).rejects.toThrow('60 paginas')
  expect(getPage).not.toHaveBeenCalled()
  expect(destroy).toHaveBeenCalledOnce()
})

it('destroys the PDF task when page extraction fails', async () => {
  const destroy = vi.fn()
  getDocumentMock.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockRejectedValue(new Error('invalid page')) }), destroy })
  await expect(importFinancialFile(profile(), new File(['pdf'], 'bad.pdf', { type: 'application/pdf' }))).rejects.toThrow('invalid page')
  expect(destroy).toHaveBeenCalledOnce()
})


it('rejects oversized OCR canvases before rendering and terminates the worker', async () => {
  const render = vi.fn()
  const destroy = vi.fn()
  const cleanup = vi.fn()
  const canvas = { width: 0, height: 0, getContext: vi.fn() }
  getDocumentMock.mockReturnValue({ destroy, promise: Promise.resolve({
    numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }),
      getViewport: () => ({ width: 10000, height: 10000 }), render, cleanup }),
  }) })
  vi.stubGlobal('document', { createElement: () => canvas })
  ocrWorker.terminate.mockClear()
  ocrWorker.recognize.mockClear()
  try {
    await expect(importFinancialFile(profile(), new File(['pdf'], 'oversized.pdf', { type: 'application/pdf' }))).rejects.toThrow('resolucion')
    expect(render).not.toHaveBeenCalled()
    expect(canvas.getContext).not.toHaveBeenCalled()
    expect(ocrWorker.recognize).not.toHaveBeenCalled()
    expect(ocrWorker.terminate).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  } finally { vi.unstubAllGlobals() }
})

it('does not enlarge the admitted PDF canvas during OCR preparation', async () => {
  const destroy = vi.fn()
  const createImageBitmap = vi.fn().mockRejectedValue(new Error('unexpected preprocessing'))
  const canvas = { width: 0, height: 0, getContext: () => ({}),
    toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })),
  }
  getDocumentMock.mockReturnValue({ destroy, promise: Promise.resolve({ numPages: 1, getPage: async () => ({
    getTextContent: async () => ({ items: [] }), getViewport: () => ({ width: 2000, height: 4000 }),
    render: () => ({ promise: Promise.resolve() }), cleanup: vi.fn(),
  }) }) })
  vi.stubGlobal('document', { createElement: () => canvas })
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  ocrWorker.recognize.mockClear()
  try {
    await importFinancialFile(profile(), new File(['pdf'], 'scanned.pdf', { type: 'application/pdf' }))
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(ocrWorker.recognize).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
    expect(destroy).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})
