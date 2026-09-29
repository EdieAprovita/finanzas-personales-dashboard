import { describe, expect, it } from 'vitest'
import { buildBalanceSheet } from './balanceSheet'
import type { FinancialProfile } from './types'

const profile: FinancialProfile = {
  schemaVersion: 2,
  reportingCurrency: 'MXN',
  id: 'balance-sheet-test',
  name: 'Balance',
  description: '',
  grossMonthlyIncome: 0,
  netMonthlyIncome: 0,
  accounts: [
    { id: 'cash', name: 'Cuenta', type: 'checking', balance: 20_000, currency: 'MXN' },
    { id: 'home', name: 'Casa', type: 'property', balance: 800_000, currency: 'MXN' },
    { id: 'card', name: 'Tarjeta', type: 'credit_card', balance: -5_000, currency: 'MXN' },
    { id: 'loan', name: 'Préstamo', type: 'loan', balance: -50_000, currency: 'MXN' },
  ],
  transactions: [],
  debts: [
    { id: 'loan-debt', accountId: 'loan', name: 'Hipoteca', balance: 50_000, apr: 0, minimumPayment: 0, currency: 'MXN', dueDate: '2026-12-31' },
  ],
  goals: [],
  budgets: [],
  monthlySnapshots: [],
  importedDocuments: [],
}

describe('buildBalanceSheet', () => {
  it('keeps assets and debts separate and avoids double counting linked debt accounts', () => {
    const result = buildBalanceSheet(profile)

    expect(result.totalAssets).toBe(820_000)
    expect(result.totalLiabilities).toBe(55_000)
    expect(result.netWorth).toBe(765_000)
    expect(result.liquidNetWorth).toBe(-35_000)
  })

  it('counts receivables as assets without treating them as available cash', () => {
    const result = buildBalanceSheet({
      ...profile,
      accounts: [...profile.accounts, { id: 'receivable', name: 'Por cobrar', type: 'receivable', balance: 10_000, currency: 'MXN' }],
    })
    expect(result.totalAssets).toBe(830_000)
    expect(result.liquidNetWorth).toBe(-35_000)
  })
})
