import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
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
    id: 'csv-test',
    importedDocuments: [],
    monthlySnapshots: [],
    name: 'CSV test',
    netMonthlyIncome: 0,
    reportingCurrency: 'MXN',
    schemaVersion: 2,
    transactions: [],
  }
}

describe('importFinancialFile CSV', () => {
  it('imports a non-AMEX credit card export after a preamble row', async () => {
    const file = new File(
      [
        [
          'Resumen de tarjeta',
          'Fecha de compra,Concepto,Referencia,Importe,Tipo,No. tarjeta',
          '18/06/2026,Tienda de prueba,001,100.00 DR,Cargo,1234',
          '19/06/2026,Pago tarjeta,002,50.00 CR,Abono,1234',
        ].join('\n'),
      ],
      'tarjeta.csv',
      { type: 'text/csv' },
    )

    const result = await importFinancialFile(profile(), file)

    expect(result.document.kind).toBe('credit_card_statement')
    expect(result.document.extractedRows).toBe(2)
    expect(result.profile.accounts).toContainEqual(expect.objectContaining({ type: 'credit_card' }))
    expect(result.profile.transactions).toEqual([
      expect.objectContaining({ amount: -100, type: 'expense' }),
      expect.objectContaining({ amount: 50, type: 'debt_payment' }),
    ])
  })
})
