import { describe, expect, it, vi } from 'vitest'
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
vi.mock('tesseract.js', () => ({ createWorker: async () => ({
  setParameters: vi.fn(), terminate: vi.fn(),
  recognize: async () => ({ data: { text: 'TIENDA DEMO\n2026-06-08\nTOTAL 1250.50', confidence: 99 } }),
}) }))
import type { FinancialProfile } from '../../domain/types'
import { applyReviewedDocument, importFinancialFile, importFinancialFiles } from './pipeline'

function syntheticPng(width = 760, height = 420): File {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([73, 72, 68, 82], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return new File([bytes], 'receipt.png', { type: 'image/png' })
}

const emptyProfile = (): FinancialProfile => ({
  schemaVersion: 2, reportingCurrency: 'MXN', id: 'receipt-test', name: 'Receipt test', description: '',
  accounts: [], transactions: [], budgets: [], debts: [], goals: [], importedDocuments: [], monthlySnapshots: [],
  grossMonthlyIncome: 0, netMonthlyIncome: 0,
})

describe('receipt manual approval', () => {
  it('rejects an extreme image before invoking the browser decoder', async () => {
    const decoder = vi.fn()
    vi.stubGlobal('createImageBitmap', decoder)

    await expect(importFinancialFile(emptyProfile(), syntheticPng(100_000, 100_000))).rejects.toThrow('limite seguro')
    expect(decoder).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('rejects image batches above the shared pixel budget', async () => {
    const files = [syntheticPng(5000, 3000), syntheticPng(5000, 3000), syntheticPng(5000, 3000)]
    await expect(importFinancialFiles(emptyProfile(), files)).rejects.toThrow('El lote excede el limite seguro')
  })

  it('keeps high-confidence OCR pending, applies reviewed values once, and preserves approval on reimport', async () => {
    const file = syntheticPng()
    const result = await importFinancialFile(emptyProfile(), file)
    expect(result.document.status).toBe('needs_review')
    expect(result.document.extracted?.ocrConfidence).toBe(0.99)
    expect(result.profile.accounts).toEqual([])
    expect(result.profile.transactions).toEqual([])
    const approved = applyReviewedDocument(result.profile, result.document.id, { date: '2026-06-09', total: 120, merchant: 'Comercio revisado' })
    expect(approved.profile.transactions).toHaveLength(1)
    expect(approved.profile.transactions[0]).toMatchObject({ date: '2026-06-09', amount: -120, merchant: 'Comercio revisado', type: 'expense' })
    expect(approved.profile.accounts[0]?.balance).toBe(-120)
    expect(approved.document.extracted?.reviewedMovementRowsApproval).toBe('manual_user_action')
    expect(() => applyReviewedDocument(approved.profile, approved.document.id)).toThrow('ya tenia')
    const reimported = await importFinancialFile(approved.profile, file)
    expect(reimported.profile.transactions).toHaveLength(1)
    expect(reimported.profile.accounts[0]?.balance).toBe(-120)
    expect(reimported.profile.importedDocuments[0]?.extracted).toMatchObject({ reviewedMovementRowsApproval: 'manual_user_action', total: 120, date: '2026-06-09', merchant: 'Comercio revisado' })
  })
  it('rejects invalid review fields without changing the profile', async () => {
    const result = await importFinancialFile(emptyProfile(), syntheticPng())
    for (const total of [0, -1, NaN, Infinity]) expect(() => applyReviewedDocument(result.profile, result.document.id, { total })).toThrow()
    expect(() => applyReviewedDocument(result.profile, result.document.id, { date: '2026-02-30' })).toThrow()
    expect(() => applyReviewedDocument(result.profile, result.document.id, { merchant: ' ' })).toThrow()
    expect(result.profile.transactions).toEqual([])
  })
})
