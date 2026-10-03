import { describe, expect, it } from 'vitest'
import { closeMonthlySnapshot, monthlyCloseBlockers, recalculateLatestSnapshot } from './snapshots'
import type { FinancialProfile } from './types'

function profile(): FinancialProfile {
  return {
    schemaVersion: 2,
    reportingCurrency: 'MXN',
    id: 'monthly-close-test',
    name: 'Cierre sintetico',
    description: '',
    grossMonthlyIncome: 10_000,
    netMonthlyIncome: 10_000,
    accounts: [{ id: 'cash', name: 'Cuenta sintetica', type: 'checking', balance: 8_000, currency: 'MXN' }],
    transactions: [{ id: 'income', date: '2026-06-15', amount: 10_000, merchant: 'Ingreso sintetico', category: 'Ingreso', accountId: 'cash', type: 'income' }],
    debts: [],
    goals: [],
    budgets: [],
    monthlySnapshots: [{ month: '2026-06', income: 10_000, expenses: 0, debtPayments: 0, savings: 10_000, netWorth: 8_000 }],
    importedDocuments: [],
    investmentPositions: [],
  }
}

describe('monthly close', () => {
  it('stores the confirmed balance date and keeps the close while values stay unchanged', () => {
    const closed = closeMonthlySnapshot(profile(), '2026-06', '2026-06-30', '2026-07-01T12:00:00.000Z')
    expect(closed.monthlySnapshots[0]).toMatchObject({ balanceAsOf: '2026-06-30', reconciledAt: '2026-07-01T12:00:00.000Z' })
    expect(recalculateLatestSnapshot(closed, '2026-06-30').monthlySnapshots[0]?.reconciledAt).toBe('2026-07-01T12:00:00.000Z')
  })

  it('reopens the period when a later edit changes its totals', () => {
    const closed = closeMonthlySnapshot(profile(), '2026-06', '2026-06-30', '2026-07-01T12:00:00.000Z')
    const changed = { ...closed, transactions: [...closed.transactions, { id: 'expense', date: '2026-06-20', amount: -500, merchant: 'Gasto sintetico', category: 'Otros', accountId: 'cash', type: 'expense' as const }] }
    const recalculated = recalculateLatestSnapshot(changed, '2026-06-30')
    expect(recalculated.monthlySnapshots[0]?.reconciledAt).toBeUndefined()
    expect(recalculated.monthlySnapshots[0]?.expenses).toBe(500)
  })

  it('blocks documents pending review and dates outside the selected month', () => {
    const pending = {
      ...profile(),
      importedDocuments: [{
        id: 'pending', fileName: 'synthetic.csv', fileType: 'csv' as const, importedAt: '2026-06-20T00:00:00.000Z',
        status: 'needs_review' as const, summary: 'Documento sintetico', rows: 1, kind: 'bank_statement' as const,
        extracted: { periodEnd: '2026-06-30' }, extractedRows: 1, warnings: [],
      }],
    }
    expect(monthlyCloseBlockers(pending, '2026-06')).toEqual(['1 documento(s) del periodo siguen pendientes de revision.'])
    expect(() => closeMonthlySnapshot(pending, '2026-06', '2026-06-30', '2026-07-01T12:00:00.000Z')).toThrow(/pendientes de revision/)
    expect(() => closeMonthlySnapshot(profile(), '2026-06', '2026-07-01', '2026-07-01T12:00:00.000Z')).toThrow(/debe pertenecer/)
  })

  it('blocks other reconciliation signals and invalid civil dates', () => {
    const pending = profile()
    pending.importedDocuments = [{
      id: 'pending-balance', fileName: 'synthetic.csv', fileType: 'csv', importedAt: '2026-06-20T00:00:00.000Z',
      status: 'processed', summary: 'Saldo pendiente sintetico', extractedRows: 1,
      extracted: { periodEnd: '2026-06-30', balancePendingReview: true }, warnings: [],
    }]

    expect(monthlyCloseBlockers(pending, '2026-06')).toEqual(['1 documento(s) del periodo siguen pendientes de revision.'])
    const previouslyClosed = closeMonthlySnapshot(profile(), '2026-06', '2026-06-30', '2026-07-01T12:00:00.000Z')
    expect(recalculateLatestSnapshot({ ...previouslyClosed, importedDocuments: pending.importedDocuments }, '2026-06-30').monthlySnapshots[0]?.reconciledAt).toBeUndefined()
    expect(() => closeMonthlySnapshot(profile(), '2026-06', '2026-06-31', '2026-07-01T12:00:00.000Z')).toThrow(/debe pertenecer/)
    expect(monthlyCloseBlockers(profile(), '2026-07', '2026-06-30')).toContain('No puedes cerrar un periodo futuro.')
  })

  it('reopens a closed month when account or documented balances change', () => {
    const withDocument = profile()
    withDocument.importedDocuments = [{
      id: 'statement', fileName: 'synthetic.csv', fileType: 'csv', importedAt: '2026-06-20T00:00:00.000Z',
      status: 'processed', summary: 'Estado sintetico', extractedRows: 1, kind: 'bank_statement',
      extracted: { accountId: 'cash', periodEnd: '2026-06-30', closingBalance: 8_000 }, warnings: [],
    }]
    const calculated = recalculateLatestSnapshot(withDocument, '2026-06-30')
    const closed = closeMonthlySnapshot(calculated, '2026-06', '2026-06-30', '2026-07-01T12:00:00.000Z')

    const accountChanged = recalculateLatestSnapshot({
      ...closed,
      accounts: closed.accounts.map((account) => ({ ...account, balance: 7_000 })),
    }, '2026-06-30')
    expect(accountChanged.monthlySnapshots[0]?.reconciledAt).toBeUndefined()

    const documentChanged = recalculateLatestSnapshot({
      ...closed,
      importedDocuments: closed.importedDocuments.map((document) => ({
        ...document,
        extracted: { ...document.extracted, closingBalance: 7_500 },
      })),
    }, '2026-06-30')
    expect(documentChanged.monthlySnapshots[0]?.reconciledAt).toBeUndefined()
  })
})
