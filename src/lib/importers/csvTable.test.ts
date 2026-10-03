import { describe, expect, it } from 'vitest'
import { parseCsvTable } from './csvTable'

describe('parseCsvTable', () => {
  it('finds a semicolon table after a bank-export preamble', () => {
    const table = parseCsvTable([
      'sep=;',
      'Banco de prueba',
      'Estado de movimientos',
      'Fecha de operación;Descripción del movimiento;Referencia;Debe;Haber;Saldo',
      '18/06/2026;Compra supermercado;1234;1250.00;;5000.00',
    ].join('\n'))

    expect(table.headerRowIndex).toBe(2)
    expect(table.fields).toContain('fecha_de_operacion')
    expect(table.data).toEqual([
      expect.objectContaining({
        descripcion_del_movimiento: 'Compra supermercado',
        fecha_de_operacion: '18/06/2026',
      }),
    ])
  })

  it('keeps quoted commas inside a detected transaction description', () => {
    const table = parseCsvTable([
      'Resumen de tarjeta',
      'Fecha de compra,Concepto,Referencia,Importe,No. tarjeta',
      '18/06/2026,"Restaurante, sucursal centro",9876,350.00,1234',
    ].join('\n'))

    expect(table.headerRowIndex).toBe(1)
    expect(table.data[0]).toMatchObject({
      concepto: 'Restaurante, sucursal centro',
      importe: '350.00',
    })
  })
})

describe('CSV work budget', () => {
  it('accepts the row limit and rejects overflow rather than returning a partial table', () => {
    const header = 'Fecha,Concepto,Importe'
    const row = '2026-06-01,Compra,10'
    expect(parseCsvTable([header, ...Array(9999).fill(row)].join('\n')).data).toHaveLength(9999)
    expect(() => parseCsvTable([header, ...Array(10000).fill(row)].join('\n'))).toThrow('10000 filas')
  })
  it('counts quoted multiline records rather than physical lines', () => {
    const row = '2026-06-01,"Compra\nsegunda linea",10'
    expect(parseCsvTable(['Fecha,Concepto,Importe', ...Array(9999).fill(row)].join('\n')).data).toHaveLength(9999)
  })
})
