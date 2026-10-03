import Papa from 'papaparse'
import { normalizeHeader } from './normalization'

export const MAX_CSV_ROWS = 10_000

export interface CsvTable {
  errors: string[]
  fields: string[]
  headerRowIndex: number
  data: Array<Record<string, string>>
}

const dateHeaders = new Set([
  'fecha',
  'date',
  'fecha_de_compra',
  'fecha_de_cargo',
  'fecha_de_movimiento',
  'fecha_de_operacion',
  'fecha_de_registro',
  'fecha_de_proceso',
  'fecha_valor',
])
const descriptionHeaders = new Set([
  'concepto',
  'concepto_de_movimiento',
  'descripcion',
  'descripcion_del_movimiento',
  'detalle',
  'merchant',
  'comercio',
])
const amountHeaders = new Set([
  'abono',
  'cargo',
  'credito',
  'debito',
  'debe',
  'haber',
  'importe',
  'importe_mxn',
  'monto',
  'monto_mxn',
  'saldo',
])

function scoreHeader(cells: string[]): number {
  const headers = new Set(cells.map(normalizeHeader).filter(Boolean))
  const dates = [...headers].filter((header) => dateHeaders.has(header)).length
  const descriptions = [...headers].filter((header) => descriptionHeaders.has(header)).length
  const amounts = [...headers].filter((header) => amountHeaders.has(header)).length
  return dates * 4 + descriptions * 4 + amounts * 3 + Math.min(headers.size, 8) / 100
}

function explicitDelimiter(source: string): string | undefined {
  const firstLine = source.split(/\r?\n/, 1)[0]?.trim().toLowerCase() ?? ''
  const separator = firstLine.match(/^sep\s*=\s*([,;\t|])$/)
  return separator?.[1]
}

function sourceWithoutSeparatorLine(source: string): string {
  return /^\s*sep\s*=\s*[,;\t|]\s*(?:\r?\n|$)/i.test(source) ? source.replace(/^.*(?:\r?\n|$)/, '') : source
}

function uniqueFields(cells: string[]): string[] {
  const counts = new Map<string, number>()
  return cells.map((cell, index) => {
    const base = normalizeHeader(cell) || `columna_${index + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

/** Finds a financial CSV header after optional bank-export preamble rows. */
export function parseCsvTable(source: string): CsvTable {
  const delimiter = explicitDelimiter(source)
  const rows: string[][] = []
  const errors: string[] = []
  let exceeded = false
  Papa.parse<string[]>(sourceWithoutSeparatorLine(source), {
    delimiter,
    skipEmptyLines: 'greedy',
    step(result, parser) {
      errors.push(...result.errors.map((error) => error.code).filter(Boolean))
      if (rows.length >= MAX_CSV_ROWS) {
        exceeded = true
        parser.abort()
        return
      }
      rows.push(result.data)
    },
  })
  if (exceeded) throw new Error(`El CSV excede el limite de ${MAX_CSV_ROWS} filas, incluido el encabezado. Divide el archivo antes de importarlo.`)
  const candidateLimit = Math.min(rows.length, 50)
  let headerRowIndex = 0
  let bestScore = -1
  for (let index = 0; index < candidateLimit; index += 1) {
    const row = rows[index]
    if (!row) continue
    const score = scoreHeader(row)
    if (score > bestScore) {
      bestScore = score
      headerRowIndex = index
    }
  }

  const header = uniqueFields(rows[headerRowIndex] ?? [])
  const recordRows = rows.slice(headerRowIndex + 1).map((row) =>
    Object.fromEntries(header.map((field, index) => [field, row[index]?.trim() ?? ''])),
  )

  return {
    errors,
    fields: header,
    headerRowIndex,
    data: recordRows,
  }
}
