import { describe, expect, it, vi } from 'vitest'
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
vi.mock('tesseract.js', () => ({ createWorker: async () => ({
  setParameters: vi.fn(), terminate: vi.fn(),
  recognize: async () => ({ data: { text: 'TIENDA DEMO\n2026-06-08\nTOTAL 1250.50', confidence: 99 } }),
}) }))
import type { FinancialProfile } from '../../domain/types'
import { applyReviewedDocument, importFinancialFile } from './pipeline'

const emptyProfile = (): FinancialProfile => ({
  schemaVersion: 2, reportingCurrency: 'MXN', id: 'receipt-test', name: 'Receipt test', description: '',
  accounts: [], transactions: [], budgets: [], debts: [], goals: [], importedDocuments: [], monthlySnapshots: [],
  grossMonthlyIncome: 0, netMonthlyIncome: 0,
})

describe('receipt manual approval', () => {
  it('keeps high-confidence OCR pending, applies reviewed values once, and preserves approval on reimport', async () => {
    const file = new File(['synthetic image'], 'receipt.png', { type: 'image/png' })
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
    const result = await importFinancialFile(emptyProfile(), new File(['image'], 'receipt.png', { type: 'image/png' }))
    for (const total of [0, -1, NaN, Infinity]) expect(() => applyReviewedDocument(result.profile, result.document.id, { total })).toThrow()
    expect(() => applyReviewedDocument(result.profile, result.document.id, { date: '2026-02-30' })).toThrow()
    expect(() => applyReviewedDocument(result.profile, result.document.id, { merchant: ' ' })).toThrow()
    expect(result.profile.transactions).toEqual([])
  })
})
