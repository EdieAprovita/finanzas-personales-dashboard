import { describe, expect, it } from 'vitest'
import { extractPayrollLayoutFacts } from './pdfPayrollLayout'
import type { PdfTextPage, PdfTextRun } from './pdfLayout'

function run(str: string, x: number, y: number, index: number): PdfTextRun {
  return { height: 10, index, str, width: str.length * 5, x, y }
}

function page(runs: PdfTextRun[]): PdfTextPage {
  return { itemCount: runs.length, pageNumber: 1, plainText: '', runs, text: '' }
}

describe('extractPayrollLayoutFacts', () => {
  it('extracts perception and deduction rows from two side-by-side payroll columns', () => {
    const facts = extractPayrollLayoutFacts([
      page([
        run('P001', 31, 560, 1),
        run('SUELDO', 85, 560, 2),
        run('47,895.00', 255, 560, 3),
        run('D001', 310, 560, 4),
        run('ISR', 364, 560, 5),
        run('11,236.55', 531, 560, 6),
        run('P024', 31, 548, 7),
        run('VALES DE DESPENSA', 85, 548, 8),
        run('483.60', 266, 548, 9),
        run('D002', 310, 548, 10),
        run('IMSS', 364, 548, 11),
        run('1,279.62', 535, 548, 12),
      ]),
    ])

    expect(facts.perceptionConcepts).toEqual([
      expect.objectContaining({ amount: 47895, code: 'P001', concept: 'SUELDO', type: '001' }),
      expect.objectContaining({ amount: 483.6, code: 'P024', concept: 'VALES DE DESPENSA', type: '024' }),
    ])
    expect(facts.deductionConcepts).toEqual([
      expect.objectContaining({ amount: 11236.55, code: 'D001', concept: 'ISR', type: '001' }),
      expect.objectContaining({ amount: 1279.62, code: 'D002', concept: 'IMSS', type: '002' }),
    ])
  })
})
