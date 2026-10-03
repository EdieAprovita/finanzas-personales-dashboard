import { test } from 'node:test'
import assert from 'node:assert/strict'
import { financialProfileSchema } from './profile-schema.mjs'

function profileWithSnapshot(snapshot) {
  return {
    schemaVersion: 2,
    reportingCurrency: 'MXN',
    id: 'schema-test',
    name: 'Schema test',
    description: '',
    grossMonthlyIncome: 0,
    netMonthlyIncome: 0,
    accounts: [],
    transactions: [],
    debts: [],
    goals: [],
    budgets: [],
    monthlySnapshots: [{ month: '2026-06', income: 0, expenses: 0, debtPayments: 0, savings: 0, netWorth: 0, ...snapshot }],
    importedDocuments: [],
    investmentPositions: [],
  }
}

test('monthly close metadata is paired and uses a real date in the snapshot month', () => {
  assert.equal(financialProfileSchema.safeParse(profileWithSnapshot({ reconciledAt: '2026-07-01T12:00:00.000Z' })).success, false)
  assert.equal(financialProfileSchema.safeParse(profileWithSnapshot({ balanceAsOf: '2026-06-31', reconciledAt: '2026-07-01T12:00:00.000Z' })).success, false)
  assert.equal(financialProfileSchema.safeParse(profileWithSnapshot({ balanceAsOf: '2026-07-01', reconciledAt: '2026-07-01T12:00:00.000Z' })).success, false)
  assert.equal(financialProfileSchema.safeParse(profileWithSnapshot({ balanceAsOf: '2026-06-30', reconciledAt: '2026-07-01T12:00:00.000Z' })).success, true)
})
