import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}))

import { calculateMetrics } from './finance'
import { applyReviewedStatementMovements } from '../lib/importers'
import { recalculateLatestSnapshot } from './snapshots'
import type { FinancialProfile } from './types'

function profile(overrides: Partial<FinancialProfile> = {}): FinancialProfile {
  return {
    schemaVersion: 2,
    reportingCurrency: 'MXN',
    id: 'test',
    name: 'Perfil de prueba',
    description: '',
    grossMonthlyIncome: 10000,
    netMonthlyIncome: 10000,
    accounts: [{ id: 'cash', name: 'Cuenta', type: 'checking', balance: 10000, currency: 'MXN' }],
    transactions: [],
    debts: [],
    goals: [],
    budgets: [],
    monthlySnapshots: [{ month: '2026-06', income: 10000, expenses: 6000, debtPayments: 0, savings: 4000, netWorth: 10000 }],
    importedDocuments: [],
    ...overrides,
  }
}

describe('calculateMetrics', () => {
  it('uses the selected reporting period for category spending', () => {
    const result = calculateMetrics(
      profile({
        transactions: [
          { id: 'june', date: '2026-06-03', amount: -500, merchant: 'Junio', category: 'Comida', accountId: 'cash', type: 'expense' },
          { id: 'july', date: '2026-07-03', amount: -900, merchant: 'Julio', category: 'Comida', accountId: 'cash', type: 'expense' },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.categorySpend).toEqual([{ category: 'Comida', amount: 500, budget: 0 }])
  })

  it('does not double-count a linked credit-card liability', () => {
    const result = calculateMetrics(
      profile({
        accounts: [
          { id: 'cash', name: 'Cuenta', type: 'checking', balance: 1000, currency: 'MXN' },
          { id: 'card', name: 'Tarjeta', type: 'credit_card', balance: -500, currency: 'MXN', creditLimit: 5000 },
        ],
        debts: [{ id: 'debt-card', accountId: 'card', name: 'Tarjeta', balance: 500, apr: 0, minimumPayment: 100, creditLimit: 5000, dueDate: '2026-07-15', currency: 'MXN' }],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.netWorth).toBe(500)
  })

  it('excludes foreign currency accounts from MXN totals without a dated FX rate', () => {
    const result = calculateMetrics(
      profile({
        accounts: [
          { id: 'cash', name: 'Cuenta', type: 'checking', balance: 1000, currency: 'MXN' },
          { id: 'usd', name: 'Dólares', type: 'savings', balance: 1000, currency: 'USD' },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.netWorth).toBe(1000)
    expect(result.excludedForeignAccountCount).toBe(1)
  })

  it('keeps deficits in goal capacity instead of discarding them', () => {
    const result = calculateMetrics(
      profile({
        goals: [{ id: 'goal', name: 'Meta', type: 'savings', targetAmount: 1000, currentSaved: 0, targetDate: '2026-12-01', plannedMonthlyContribution: 100, currency: 'MXN' }],
        monthlySnapshots: [
          { month: '2026-05', income: 1000, expenses: 0, debtPayments: 0, savings: 1000, netWorth: 0 },
          { month: '2026-06', income: 0, expenses: 1000, debtPayments: 0, savings: -1000, netWorth: 0 },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.goalMonthlyCapacity).toBe(0)
  })

  it('shows budget categories without spending and flags overspending', () => {
    const result = calculateMetrics(
      profile({
        budgets: [
          { category: 'Comida', monthlyLimit: 1000 },
          { category: 'Salud', monthlyLimit: 500 },
        ],
        transactions: [{ id: 'food', date: '2026-06-04', amount: -1200, merchant: 'Mercado', category: 'Comida', accountId: 'cash', type: 'expense' }],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.budgetProgress).toMatchObject([
      { category: 'Comida', amount: 1200, budget: 1000, remaining: -200, status: 'red' },
      { category: 'Salud', amount: 0, budget: 500, remaining: 500, status: 'green' },
    ])
  })

  it('projects cash flow from the last three available reporting months', () => {
    const result = calculateMetrics(
      profile({
        monthlySnapshots: [
          { month: '2026-04', income: 10000, expenses: 6000, debtPayments: 500, savings: 3500, netWorth: 10000 },
          { month: '2026-05', income: 12000, expenses: 7000, debtPayments: 500, savings: 4500, netWorth: 14500 },
          { month: '2026-06', income: 11000, expenses: 6500, debtPayments: 500, savings: 4000, netWorth: 18500 },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.cashFlowForecast).toEqual({
      monthsAnalyzed: 3,
      projectedIncome: 11000,
      projectedExpenses: 6500,
      projectedDebtPayments: 500,
      projectedCashFlow: 4000,
    })
  })
})

describe('recalculateLatestSnapshot', () => {
  it('does not append an empty month during a reload', () => {
    const original = profile()
    const recalculated = recalculateLatestSnapshot(original, '2026-07-09')

    expect(recalculated).toBe(original)
    expect(recalculated.monthlySnapshots).toHaveLength(1)
  })
})

describe('applyReviewedStatementMovements', () => {
  it('applies a reviewed payroll PDF only with a detected payment date and net income', () => {
    const result = applyReviewedStatementMovements(
      profile({
        accounts: [],
        importedDocuments: [
          {
            id: 'payroll-pdf',
            fileName: 'nomina.pdf',
            fileType: 'pdf',
            importedAt: '2026-07-13T00:00:00.000Z',
            status: 'needs_review',
            summary: 'Nomina PDF revisada.',
            extractedRows: 0,
            kind: 'payroll_cfdi',
            detectedInstitution: 'Empresa',
            extracted: { paymentDate: '2026-06-15', netIncome: 12000 },
          },
        ],
      }),
      'payroll-pdf',
    )

    expect(result.profile.transactions).toMatchObject([
      { date: '2026-06-15', amount: 12000, category: 'Nomina', type: 'income' },
    ])
    expect(result.document.status).toBe('processed')
    expect(result.document.extracted?.reviewedMovementRowsApplied).toBe(1)
  })
})
