import { describe, expect, it } from 'vitest'
import { extractCreditCardLayoutRows, type PdfTextPage, type PdfTextRun } from './pdfLayout'

function run(str: string, x: number, y: number, index: number): PdfTextRun {
  return { height: 10, index, str, width: str.length * 5, x, y }
}

function page(runs: PdfTextRun[], text = ''): PdfTextPage {
  return { itemCount: runs.length, pageNumber: 1, plainText: '', runs, text }
}

describe('extractCreditCardLayoutRows', () => {
  it('uses native coordinates rather than content stream order for card columns', () => {
    const rows = extractCreditCardLayoutRows([
      page([
        run('Descripción', 110, 700, 4),
        run('Saldo', 590, 700, 6),
        run('Fecha', 30, 700, 1),
        run('Cargo', 330, 700, 2),
        run('Pago', 410, 700, 3),
        run('Crédito', 500, 700, 5),
        run('125.50', 330, 680, 12),
        run('15/06/2026', 30, 680, 10),
        run('Comercio Uno', 110, 680, 11),
        run('9124.50', 590, 680, 13),
        run('500.00', 410, 660, 22),
        run('16/06/2026', 30, 660, 20),
        run('Pago recibido', 110, 660, 21),
        run('8624.50', 590, 660, 23),
      ]),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        amount: -125.5,
        amountSource: 'pdf_layout_coordinates',
        balance: 9124.5,
        charge: 125.5,
        date: '2026-06-15',
        description: 'Comercio Uno',
        pageNumber: 1,
      }),
      expect.objectContaining({
        amount: 500,
        balance: 8624.5,
        date: '2026-06-16',
        description: 'Pago recibido',
        payment: 500,
      }),
    ])
  })

  it('rejects table-like text without a supported date and description header', () => {
    const rows = extractCreditCardLayoutRows([
      page([
        run('Movimiento', 30, 700, 1),
        run('Importe', 330, 700, 2),
        run('15/06/2026', 30, 680, 3),
        run('125.50', 330, 680, 4),
      ]),
    ])

    expect(rows).toEqual([])
  })

  it('does not infer an ambiguous numeric date into a reporting month', () => {
    const rows = extractCreditCardLayoutRows([
      page([
        run('Fecha', 30, 700, 1),
        run('Detalle', 110, 700, 2),
        run('Cargo', 330, 700, 3),
        run('05/06/2026', 30, 680, 4),
        run('Compra ambigua', 110, 680, 5),
        run('99.99', 330, 680, 6),
      ]),
    ])

    expect(rows).toEqual([])
  })

  it('does not treat totals below a table as a movement', () => {
    const rows = extractCreditCardLayoutRows([
      page([
        run('Fecha', 30, 700, 1),
        run('Detalle', 110, 700, 2),
        run('Cargo', 330, 700, 3),
        run('15/06/2026', 30, 680, 4),
        run('Compra validada', 110, 680, 5),
        run('99.99', 330, 680, 6),
        run('Total cargos', 110, 650, 7),
        run('99.99', 330, 650, 8),
      ]),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: -99.99, description: 'Compra validada' })
  })

  it('extracts American Express activity rows with Spanish dates and CR markers', () => {
    const rows = extractCreditCardLayoutRows([
      page([
        run('Fecha y Detalle de las operaciones', 30, 700, 1),
        run('Importe en MN.', 500, 700, 2),
        run('7 de Marzo', 30, 680, 3),
        run('PAGO EN LINEA', 130, 680, 4),
        run('1,250.00', 500, 680, 5),
        run('CR', 500, 662, 6),
        run('9 de Marzo', 30, 640, 7),
        run('COMPRA EN COMERCIO', 130, 640, 8),
        run('320.50', 500, 640, 9),
        run('Saldo a Pagar', 30, 610, 10),
      ], 'Estado del 6 de Abril de 2026'),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        amount: 1250,
        amountSource: 'pdf_layout_amex_coordinates',
        date: '2026-03-07',
        description: 'PAGO EN LINEA',
        payment: 1250,
      }),
      expect.objectContaining({
        amount: -320.5,
        amountSource: 'pdf_layout_amex_coordinates',
        charge: 320.5,
        date: '2026-03-09',
        description: 'COMPRA EN COMERCIO',
      }),
    ])
  })
})
