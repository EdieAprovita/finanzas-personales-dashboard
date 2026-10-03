import type { ExtractedFacts, PositionFact } from './contracts'
import { parseMoney, sanitizeImportedText } from './normalization'
import type { PdfTextPage, PdfTextRun } from './pdfLayout'

type PayrollConceptKind = 'deduction' | 'perception'

interface PayrollCodeRun {
  code: string
  kind: PayrollConceptKind
  run: PdfTextRun
}

const conceptCodePattern = /^([PD]\d{3})$/i
const moneyPattern = /^(?:\$?\s*)?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$|^\.\d{1,2}$/

function sameLine(left: PdfTextRun, right: PdfTextRun): boolean {
  const tolerance = Math.max(2, Math.min(5, Math.max(left.height, right.height) * 0.45))
  return Math.abs(left.y - right.y) <= tolerance
}

function conceptRuns(page: PdfTextPage): PayrollCodeRun[] {
  return page.runs.flatMap((run) => {
    const match = run.str.trim().match(conceptCodePattern)
    if (!match?.[1]) return []

    return [{
      code: match[1].toUpperCase(),
      kind: match[1].toUpperCase().startsWith('P') ? 'perception' : 'deduction',
      run,
    }]
  })
}

function rowForCode(page: PdfTextPage, entry: PayrollCodeRun): PositionFact | null {
  const lineRuns = page.runs
    .filter((run) => sameLine(run, entry.run))
    .filter((run) => run.x >= entry.run.x)
    .sort((left, right) => left.x - right.x)

  const nextColumnStart = entry.kind === 'perception' ? 300 : Number.POSITIVE_INFINITY
  const inColumn = lineRuns.filter((run) => run.x < nextColumnStart)
  const amountRun = [...inColumn]
    .reverse()
    .find((run) => moneyPattern.test(run.str.trim()))
  if (!amountRun) return null

  const amount = Math.abs(parseMoney(amountRun.str))
  if (!Number.isFinite(amount)) return null

  const concept = sanitizeImportedText(
    inColumn
      .filter((run) => run.x > entry.run.x + entry.run.width)
      .filter((run) => run.x < amountRun.x)
      .map((run) => run.str)
      .join(' '),
  )
  if (!concept) return null

  return {
    amount,
    code: entry.code,
    concept,
    extractionMethod: 'pdf_layout_coordinates',
    pageNumber: page.pageNumber,
    rowConfidence: 0.8,
    type: entry.code.slice(1),
  }
}

function rowsForKind(pages: PdfTextPage[], kind: PayrollConceptKind): PositionFact[] {
  const rows = pages.flatMap((page) =>
    conceptRuns(page)
      .filter((entry) => entry.kind === kind)
      .map((entry) => rowForCode(page, entry))
      .filter((row): row is PositionFact => Boolean(row)),
  )

  const fingerprints = new Set<string>()
  return rows.filter((row) => {
    const fingerprint = `${row.code}|${row.concept}|${row.amount}`
    if (fingerprints.has(fingerprint)) return false
    fingerprints.add(fingerprint)
    return true
  })
}

/** Extracts payroll concepts from a text-native PDF without treating it as a verified CFDI XML. */
export function extractPayrollLayoutFacts(pages: PdfTextPage[]): ExtractedFacts {
  const perceptionConcepts = rowsForKind(pages, 'perception')
  const deductionConcepts = rowsForKind(pages, 'deduction')

  return {
    deductionConcepts,
    payrollDeductionRows: deductionConcepts.length || undefined,
    payrollLayoutExtractionMethod:
      perceptionConcepts.length || deductionConcepts.length ? 'pdf_layout_coordinates' : undefined,
    payrollPerceptionRows: perceptionConcepts.length || undefined,
    perceptionConcepts,
  }
}
