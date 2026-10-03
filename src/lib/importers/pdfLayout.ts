import type { PositionFact } from './contracts'
import { normalizeDate, normalizeForSearch, parseMoney, sanitizeImportedText } from './normalization'

export interface PdfTextRun {
  height: number
  index: number
  str: string
  width: number
  x: number
  y: number
}

export interface PdfTextPage {
  itemCount: number
  pageNumber: number
  plainText: string
  runs: PdfTextRun[]
  text: string
}

interface LayoutLine {
  runs: PdfTextRun[]
  text: string
  y: number
}

type CardColumn = 'charge' | 'credit' | 'description' | 'payment' | 'balance' | 'date'

interface ColumnAnchor {
  kind: CardColumn
  x: number
}

const datePattern = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/
const amexDatePattern = /^(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))\b/i
const moneyTokenPattern = /^(?:\(?-?\$?\s*)?\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{1,2})\)?$|^(?:\(?-?\$?\s*)?\d+\.\d{2}\)?$/
const footerPattern = /\b(?:pagina|página|page|saldo anterior|saldo actual|saldo final|resumen|total(?:es)?|cat|fecha limite|fecha límite)\b/i

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted[middle] ?? 8
}

export function pdfLayoutLines(runs: PdfTextRun[]): LayoutLine[] {
  const tolerance = Math.max(3, median(runs.map((run) => run.height).filter((value) => value > 0)) * 0.65)
  const lines: Array<{ runs: PdfTextRun[]; y: number }> = []

  for (const run of [...runs].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= tolerance)
    if (line) {
      line.runs.push(run)
      line.y = (line.y * (line.runs.length - 1) + run.y) / line.runs.length
    } else {
      lines.push({ runs: [run], y: run.y })
    }
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const orderedRuns = [...line.runs].sort((left, right) => left.x - right.x)
      return {
        runs: orderedRuns,
        text: orderedRuns.map((run) => run.str).join(' ').replace(/\s+/g, ' ').trim(),
        y: line.y,
      }
    })
    .filter((line) => Boolean(line.text))
}

function columnKind(text: string): CardColumn | null {
  const normalized = normalizeForSearch(text)
  if (/^(fecha|date)(?:\s+(?:compra|cargo|operacion|operacion))?$/.test(normalized)) return 'date'
  if (/descripcion|concepto|detalle|comercio|establecimiento|movimiento/.test(normalized)) return 'description'
  if (/saldo|balance/.test(normalized)) return 'balance'
  if (/pago|abono|payment/.test(normalized)) return 'payment'
  if (/credito|bonificacion|reembolso|refund/.test(normalized)) return 'credit'
  if (/cargo|compra|debito|importe|monto|amount|charge/.test(normalized)) return 'charge'
  return null
}

function anchorsForHeader(line: LayoutLine): ColumnAnchor[] {
  const anchors = line.runs
    .map((run) => {
      const kind = columnKind(run.str)
      return kind ? { kind, x: run.x } : null
    })
    .filter((anchor): anchor is ColumnAnchor => Boolean(anchor))

  const kinds = new Set(anchors.map((anchor) => anchor.kind))
  return kinds.has('date') && kinds.has('description') && (kinds.has('charge') || kinds.has('payment') || kinds.has('credit'))
    ? anchors.sort((left, right) => left.x - right.x)
    : []
}

function valueForColumn(line: LayoutLine, start: number, end: number): string | undefined {
  const candidates = line.runs
    .filter((run) => run.x >= start - 2 && run.x < end - 2)
    .map((run) => run.str.replace(/\s+/g, ''))
    .filter((value) => moneyTokenPattern.test(value))

  return candidates.length === 1 ? candidates[0] : undefined
}

function dateForColumn(line: LayoutLine, start: number, end: number): string {
  const candidate = line.runs
    .filter((run) => run.x >= start - 2 && run.x < end - 2)
    .map((run) => run.str)
    .join(' ')
    .match(datePattern)?.[0]
  if (!candidate) return ''
  const numericDate = candidate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (numericDate) {
    const first = Number(numericDate[1])
    const second = Number(numericDate[2])
    if (first <= 12 && second <= 12) return ''
  }
  return normalizeDate(candidate)
}

function descriptionForColumn(line: LayoutLine, start: number, end: number): string {
  return sanitizeImportedText(
    line.runs
      .filter((run) => run.x >= start - 2 && run.x < end - 2)
      .map((run) => run.str)
      .join(' '),
  )
}

function columnBoundary(anchors: ColumnAnchor[], index: number): number {
  return anchors[index + 1]?.x ?? Number.POSITIVE_INFINITY
}

function layoutRowFromLine(line: LayoutLine, anchors: ColumnAnchor[], pageNumber: number): PositionFact | null {
  const dateAnchorIndex = anchors.findIndex((anchor) => anchor.kind === 'date')
  const descriptionAnchorIndex = anchors.findIndex((anchor) => anchor.kind === 'description')
  const dateAnchor = anchors[dateAnchorIndex]
  const descriptionAnchor = anchors[descriptionAnchorIndex]
  if (!dateAnchor || !descriptionAnchor) return null

  const date = dateForColumn(line, dateAnchor.x, columnBoundary(anchors, dateAnchorIndex))
  const description = descriptionForColumn(line, descriptionAnchor.x, columnBoundary(anchors, descriptionAnchorIndex))
  if (!date || description.length < 3 || footerPattern.test(description)) return null

  const values = new Map<CardColumn, number>()
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index]
    if (!anchor || anchor.kind === 'date' || anchor.kind === 'description') continue
    const value = valueForColumn(line, anchor.x, columnBoundary(anchors, index))
    if (!value) continue
    const amount = Math.abs(parseMoney(value))
    if (amount > 0) values.set(anchor.kind, amount)
  }

  const charge = values.get('charge') ?? 0
  const payment = values.get('payment') ?? 0
  const credit = values.get('credit') ?? 0
  if (charge + payment + credit <= 0 || (charge > 0 && (payment > 0 || credit > 0)) || (payment > 0 && credit > 0)) {
    return null
  }

  const amount = charge > 0 ? -charge : payment > 0 ? payment : credit
  return {
    amount,
    amountSource: 'pdf_layout_coordinates',
    balance: values.get('balance'),
    category: 'Otros',
    charge: charge || undefined,
    credit: credit || undefined,
    date,
    description,
    movementType: charge > 0 ? 'expense' : payment > 0 ? 'debt_payment' : 'transfer',
    pageNumber,
    payment: payment || undefined,
    rowConfidence: 0.75,
  }
}

function dedupeRows(rows: PositionFact[]): PositionFact[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.date}|${row.description}|${row.amount}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function amexStatementYear(pages: PdfTextPage[]): string {
  for (const page of pages) {
    const match = page.text.match(/\b(20\d{2})\b/)
    if (match?.[1]) return match[1]
  }
  return ''
}

function isAmexActivityHeader(line: LayoutLine): boolean {
  const normalized = line.text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return normalized.includes('fecha y detalle de las operaciones') && normalized.includes('importe en mn')
}

interface AmexCandidate {
  amount: number
  date: string
  description: string
  direction: 'charge' | 'credit'
  pageNumber: number
}

function extractAmericanExpressLayoutRows(pages: PdfTextPage[]): PositionFact[] {
  const year = amexStatementYear(pages)
  if (!year) return []

  const rows: PositionFact[] = []

  for (const page of pages) {
    let activityTableOpen = false
    let candidate: AmexCandidate | null = null

    const flushCandidate = (): void => {
      if (!candidate || candidate.description.length < 3) return
      const amount = candidate.direction === 'charge' ? -candidate.amount : candidate.amount
      rows.push({
        amount,
        amountSource: 'pdf_layout_amex_coordinates',
        charge: candidate.direction === 'charge' ? candidate.amount : undefined,
        credit: candidate.direction === 'credit' ? candidate.amount : undefined,
        date: candidate.date,
        description: candidate.description,
        movementType: candidate.direction === 'charge' ? 'expense' : 'debt_payment',
        pageNumber: candidate.pageNumber,
        payment: candidate.direction === 'credit' ? candidate.amount : undefined,
        rowConfidence: 0.72,
      })
      candidate = null
    }

    for (const line of pdfLayoutLines(page.runs)) {
      if (isAmexActivityHeader(line)) {
        flushCandidate()
        activityTableOpen = true
        continue
      }
      if (!activityTableOpen) continue

      const dateMatch = line.text.match(amexDatePattern)
      if (dateMatch?.[1]) {
        flushCandidate()
        const dateRun = line.runs.find((run) => amexDatePattern.test(run.str.trim()))
        const descriptionStart = dateRun ? dateRun.x + dateRun.width : 0
        const values = line.runs
          .filter((run) => run.x > descriptionStart)
          .map((run) => run.str.replace(/\s+/g, ''))
          .filter((value) => moneyTokenPattern.test(value))
        const amount = values.length === 1 ? Math.abs(parseMoney(values[0] ?? '')) : 0
        const description = sanitizeImportedText(
          line.runs
            .filter((run) => run.x >= descriptionStart)
            .filter((run) => !moneyTokenPattern.test(run.str.replace(/\s+/g, '')))
            .map((run) => run.str)
            .join(' '),
        )
        const date = normalizeDate(`${dateMatch[1]} de ${year}`)

        if (!date || !amount || description.length < 3) {
          candidate = null
          continue
        }
        candidate = {
          amount,
          date,
          description,
          direction: 'charge',
          pageNumber: page.pageNumber,
        }
        continue
      }

      if (!candidate) continue
      const normalized = line.text.trim().toUpperCase()
      if (normalized === 'CR') {
        candidate.direction = 'credit'
        continue
      }
      if (normalized === 'DB') continue
      if (footerPattern.test(line.text) || /^(?:pago|informacion|resumen|periodo)\b/i.test(line.text)) {
        flushCandidate()
        activityTableOpen = false
      }
    }
    flushCandidate()
  }

  return dedupeRows(rows).slice(0, 120)
}

/**
 * Extracts only visually unambiguous card rows from native PDF text coordinates.
 * Callers must keep these candidates under manual review and reconcile them first.
 */
export function extractCreditCardLayoutRows(pages: PdfTextPage[]): PositionFact[] {
  const rows: PositionFact[] = []

  for (const page of pages) {
    const lines = pdfLayoutLines(page.runs)
    let anchors: ColumnAnchor[] = []
    for (const line of lines) {
      const header = anchorsForHeader(line)
      if (header.length > 0) {
        anchors = header
        continue
      }
      if (anchors.length === 0 || footerPattern.test(line.text)) continue
      const row = layoutRowFromLine(line, anchors, page.pageNumber)
      if (row) rows.push(row)
    }
  }

  return dedupeRows([...rows, ...extractAmericanExpressLayoutRows(pages)]).slice(0, 120)
}
