import { describe, expect, it } from 'vitest'
import { calculateMetrics } from './finance'
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
      { period: '2026-06', asOfDate: '2026-06-30' },
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
      { period: '2026-06', asOfDate: '2026-06-30' },
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

  it('does not report zero card utilization when the credit limit is missing', () => {
    const result = calculateMetrics(
      profile({
        accounts: [{ id: 'card', name: 'Tarjeta', type: 'credit_card', balance: -500, currency: 'MXN' }],
        debts: [{ id: 'debt-card', accountId: 'card', name: 'Tarjeta', balance: 500, apr: 0, minimumPayment: 100, dueDate: '2026-07-15', currency: 'MXN' }],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.creditUtilization).toBeNaN()
    expect(result.kpis.find((kpi) => kpi.label === 'Uso de tarjeta')).toMatchObject({ value: 'Sin datos', availability: 'unavailable' })
  })

  it('leaves historical KPIs unavailable when no dated, reviewed balance exists', () => {
    const result = calculateMetrics(profile(), { period: '2026-06', asOfDate: '2026-07-09' })

    expect(result.isHistoricalPeriod).toBe(true)
    expect(result.kpis.find((kpi) => kpi.label === 'Runway liquido')).toMatchObject({ value: 'Sin datos', availability: 'unavailable' })
    expect(result.dataWarnings.join(' ')).toContain('Aún no hay estados conciliados')
  })

  it('uses dated, reviewed document balances for historical runway, debt and card use without marking them fully confirmed', () => {
    const result = calculateMetrics(
      profile({
        transactions: [
          { id: 'income', date: '2026-06-01', amount: 10000, merchant: 'Nomina', category: 'Ingreso', accountId: 'cash', type: 'income' },
          { id: 'essential', date: '2026-06-02', amount: -3000, merchant: 'Renta', category: 'Vivienda', accountId: 'cash', type: 'expense', isEssential: true },
        ],
        monthlySnapshots: [
          {
            month: '2026-06',
            income: 10000,
            expenses: 3000,
            debtPayments: 0,
            savings: 7000,
            netWorth: 10000,
            liquidCash: 12000,
            debtBalance: 2000,
            debtMinimumPayments: 1200,
            cardBalance: 2000,
            cardLimit: 8000,
            sourceDocumentIds: ['bank-june', 'card-june'],
          },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-07-09' },
    )

    expect(result.runwayMonths).toBe(4)
    expect(result.debtToIncome).toBe(0.12)
    expect(result.creditUtilization).toBe(0.25)
    expect(result.kpis.find((kpi) => kpi.label === 'Runway liquido')).toMatchObject({ availability: 'limited' })
    expect(result.kpis.find((kpi) => kpi.label === 'Uso de tarjeta')).toMatchObject({ value: '25%', availability: 'limited' })
    expect(result.dataWarnings.join(' ')).toContain('2 documento(s) conciliado(s)')
  })

  it('does not limit current KPIs for a PDF awaiting review when it has not applied data', () => {
    const result = calculateMetrics(
      profile({
        importedDocuments: [
          {
            id: 'pending-pdf',
            fileName: 'statement.pdf',
            fileType: 'pdf',
            importedAt: '2026-06-20T00:00:00.000Z',
            status: 'needs_review',
            summary: 'Awaiting manual review',
            extractedRows: 0,
            kind: 'credit_card_statement',
          },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-06-30' },
    )

    expect(result.kpis.find((kpi) => kpi.label === 'Score Finanzas OS')).toMatchObject({ availability: 'ready' })
    expect(result.dataWarnings.join(' ')).not.toContain('pendientes de revisión')
  })

  it('limits a period when a pending document already contributed its movements', () => {
    const result = calculateMetrics(
      profile({
        transactions: [{ id: 'tx-pending', date: '2026-06-03', amount: -300, merchant: 'Pendiente', category: 'Comida', accountId: 'cash', type: 'expense' }],
        importedDocuments: [
          {
            id: 'pending-csv',
            fileName: 'statement.csv',
            fileType: 'csv',
            importedAt: '2026-06-20T00:00:00.000Z',
            status: 'needs_review',
            summary: 'Applied but pending reconciliation',
            extractedRows: 1,
            sourceTransactionIds: ['tx-pending'],
            kind: 'bank_statement',
          },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-06-30' },
    )

    expect(result.kpis.find((kpi) => kpi.label === 'Score Finanzas OS')).toMatchObject({ availability: 'limited' })
    expect(result.dataWarnings.join(' ')).toContain('ya aportan movimientos')
  })

  it('uses reviewed investment positions instead of adding them to the account balance twice', () => {
    const result = calculateMetrics(
      profile({
        accounts: [{ id: 'invest', name: 'Portafolio', type: 'investment', balance: 0, currency: 'MXN' }],
        investmentPositions: [
          {
            id: 'position-etf-2026-06-30',
            accountId: 'invest',
            name: 'ETF demo',
            marketValue: 250000,
            currency: 'MXN',
            asOfDate: '2026-06-30',
          },
        ],
      }),
      { period: '2026-06', asOfDate: '2026-06-30' },
    )

    expect(result.netWorth).toBe(250000)
  })
})

describe('recalculateLatestSnapshot', () => {
  it('does not append an empty month during a reload', () => {
    const original = profile()
    const recalculated = recalculateLatestSnapshot(original, '2026-07-09')

    expect(recalculated).toBe(original)
    expect(recalculated.monthlySnapshots).toHaveLength(1)
  })

  it('persists dated balances only from processed statements when regenerating transaction snapshots', () => {
    const original = profile({
      transactions: [
        { id: 'income', date: '2026-06-01', amount: 10000, merchant: 'Nomina', category: 'Ingreso', accountId: 'cash', type: 'income' },
      ],
      importedDocuments: [
        {
          id: 'bank-june',
          fileName: 'bank.pdf',
          fileType: 'pdf',
          importedAt: '2026-07-01T00:00:00.000Z',
          status: 'processed',
          summary: 'Conciliado',
          extractedRows: 3,
          kind: 'bank_statement',
          extracted: { accountId: 'cash', periodEnd: '2026-06-30', closingBalance: 12000 },
        },
        {
          id: 'card-june',
          fileName: 'card.pdf',
          fileType: 'pdf',
          importedAt: '2026-07-01T00:00:01.000Z',
          status: 'processed',
          summary: 'Conciliado',
          extractedRows: 3,
          kind: 'credit_card_statement',
          extracted: { accountId: 'card', cutoffDate: '2026-06-30', currentBalance: 2000, creditLimit: 8000, minimumPayment: 1200 },
        },
        {
          id: 'unreviewed-card',
          fileName: 'unreviewed.pdf',
          fileType: 'pdf',
          importedAt: '2026-07-01T00:00:02.000Z',
          status: 'needs_review',
          summary: 'No aplicar',
          extractedRows: 3,
          kind: 'credit_card_statement',
          extracted: { accountId: 'other-card', cutoffDate: '2026-06-30', currentBalance: 999999, creditLimit: 999999, minimumPayment: 999999 },
        },
      ],
    })
    const recalculated = recalculateLatestSnapshot(original, '2026-07-09')

    expect(recalculated.monthlySnapshots).toContainEqual(
      expect.objectContaining({
        month: '2026-06',
        liquidCash: 12000,
        debtBalance: 2000,
        debtMinimumPayments: 1200,
        cardBalance: 2000,
        cardLimit: 8000,
        sourceDocumentIds: ['bank-june', 'card-june'],
      }),
    )
  })
})
