import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import Papa from 'papaparse'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Account, DocumentKind, FinancialProfile, ImportedDocument, Transaction } from '../domain/types'
import { expectedFieldKeysForExtracted } from './documentFieldSpecs'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface ImportResult {
  profile: FinancialProfile
  document: ImportedDocument
}

export interface ImportBatchResult {
  profile: FinancialProfile
  documents: ImportedDocument[]
  summary: string
}

export interface ApplyReviewedMovementsResult {
  profile: FinancialProfile
  document: ImportedDocument
  summary: string
}

interface ParsedTransactionInput {
  date: string
  amount: number
  merchant: string
  category: string
  accountId: string
  type?: Transaction['type']
}

const essentialCategories = new Set(['Vivienda', 'Supermercado', 'Transporte', 'Salud'])
const supportedImageExtensions = ['.png', '.jpg', '.jpeg', '.webp']
const qualitySchemaVersion = 2
const fingerprintVersion = 'content-v1'
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
})

type XmlRecord = Record<string, unknown>

interface OcrResult {
  text: string
  confidence: number
}

interface PdfTextPage {
  text: string
  plainText: string
  itemCount: number
}

type PdfTextMode = 'layout' | 'ocr' | 'layout+ocr' | 'empty'

type PositionFact = Record<string, string | number | boolean | undefined>
type ExtractedFacts = Record<string, string | number | boolean | string[] | PositionFact[] | undefined>

function rejectLargeFile(file: File) {
  const maxBytes = 12 * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error('Archivo demasiado grande para importacion local. Limite: 12 MB.')
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function docId(file: File) {
  return `doc-${slug(file.name)}-${file.size}-${Math.round(file.lastModified / 1000)}`
}

function hexFromBuffer(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fnv1a64(bytes: Uint8Array) {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

async function documentFingerprint(file: File, buffer?: ArrayBuffer) {
  const content = buffer ?? (await file.arrayBuffer())
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', content.slice(0))
    return `sha256:${hexFromBuffer(digest)}`
  }
  return `fnv1a64:${fnv1a64(new Uint8Array(content))}:${file.size}`
}

function transactionId(file: File, index: number, date: string, amount: number) {
  return `tx-${slug(file.name)}-${index}-${date}-${Math.round(amount * 100)}`
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getRowValue(row: Record<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[normalizeHeader(candidate)]
    if (value !== undefined && String(value).trim()) return String(value).trim()
  }
  return ''
}

function parseMoney(value: string | number | undefined) {
  if (typeof value === 'number') return value
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const negative = raw.includes('(') || raw.includes('-')
  const numeric = raw.replace(/[^0-9.,]/g, '')
  const lastComma = numeric.lastIndexOf(',')
  const lastDot = numeric.lastIndexOf('.')
  const cleaned =
    lastComma > -1 && lastDot > -1
      ? lastComma > lastDot
        ? numeric.replace(/\./g, '').replace(',', '.')
        : numeric.replace(/,/g, '')
      : lastComma > -1
        ? /^\d+,\d{1,2}$/.test(numeric)
          ? numeric.replace(',', '.')
          : numeric.replace(/,/g, '')
        : numeric
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return negative ? -Math.abs(parsed) : parsed
}

function validIsoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return ''
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeDate(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (dmy) {
    const rawYear = dmy[3]
    if (!rawYear) return ''
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
    const dayFirst = validIsoDate(Number(year), Number(dmy[2]), Number(dmy[1]))
    if (dayFirst) return dayFirst
    return validIsoDate(Number(year), Number(dmy[1]), Number(dmy[2]))
  }
  const monthNames: Record<string, string> = {
    jan: '01',
    ene: '01',
    enero: '01',
    feb: '02',
    febrero: '02',
    mar: '03',
    marzo: '03',
    apr: '04',
    abr: '04',
    abril: '04',
    may: '05',
    mayo: '05',
    jun: '06',
    junio: '06',
    jul: '07',
    julio: '07',
    aug: '08',
    ago: '08',
    agosto: '08',
    sep: '09',
    sept: '09',
    septiembre: '09',
    oct: '10',
    octubre: '10',
    nov: '11',
    noviembre: '11',
    dec: '12',
    dic: '12',
    diciembre: '12',
  }
  const textDate = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/^(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\.?\s+(?:de\s+)?(\d{4})/)
  const textMonth = textDate?.[2]
  const monthNumber = textMonth ? monthNames[textMonth] : undefined
  if (textDate && monthNumber) {
    return validIsoDate(Number(textDate[3]), Number(monthNumber), Number(textDate[1]))
  }
  return ''
}

function sanitizeImportedText(value: string) {
  return value
    .replace(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi, '[id-fiscal]')
    .replace(/\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, '[curp]')
    .replace(/\b\d{11}\b/g, '[nss]')
    .replace(/\b\d{18}\b/g, '[clabe]')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '****')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function isImageFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return file.type.startsWith('image/') || supportedImageExtensions.some((extension) => lowerName.endsWith(extension))
}

function inferInstitution(fileName: string, text = '') {
  const haystack = normalizeForSearch(`${fileName} ${text}`)
  const institutions: Array<[string, RegExp]> = [
    ['American Express', /american\s+express|\bamex\b/],
    ['Citibanamex', /citibanamex|\bbanamex\b/],
    ['BBVA', /\bbbva\b/],
    ['Santander', /\bsantander\b/],
    ['Banorte', /\bbanorte\b/],
    ['HSBC', /\bhsbc\b/],
    ['Scotiabank', /\bscotiabank\b/],
    ['Banregio', /\bbanregio\b/],
    ['Hey Banco', /\bhey\s+banco\b/],
    ['Nu Mexico', /\bnu\s+(mexico|tarjeta|cuenta)|nubank|cajita|nu\s+bank/],
    ['GBM', /\bgbm\b|grupo\s+bursatil\s+mexicano|smart\s+cash|trading\s+pro/],
    ['Cetesdirecto', /cetesdirecto|\bcetes\b|bonddia|bondes|udibonos/],
    ['AFORE', /\bafore\b|siefore|consar|ahorro\s+para\s+el\s+retiro|cuenta\s+individual/],
    ['PPR', /\bppr\b|plan\s+personal\s+(?:para|de)\s+el\s+retiro/],
    ['Mercado Pago', /mercado\s+pago/],
    ['Klar', /\bklar\b/],
    ['Stori', /\bstori\b/],
    ['Nomina', /nomina|payroll/],
  ]
  const match = institutions.find(([, pattern]) => pattern.test(haystack))
  if (match) return match[0]
  return undefined
}

function classifyDocument(file: File, text = '', preferredKind?: DocumentKind) {
  const haystack = normalizeForSearch(`${file.name} ${text}`)
  const reasons: string[] = []
  let kind: DocumentKind = preferredKind ?? 'unknown'
  const hasCardSignals = /tarjeta\s+(?:de\s+)?cr[eé]dito|credit\s+card|estado\s+de\s+cuenta\s+universal|pago\s+minimo|pago\s+para\s+no\s+generar|fecha\s+de\s+corte|limite\s+de\s+credito|american\s+express|amex/.test(
    haystack,
  )
  const hasInvestmentSignals =
    /inversion|investment|fondos?\s+(?:de\s+inversi[oó]n|gbm|externos)|cetes|bonddia|bondes|udibono|acciones|etf|portafolio|valor\s+de\s+mercado|valor\s+del\s+portafolio|smart\s+cash|gbm|casa\s+de\s+bolsa|trading\s+(mx|usa)|contrato\s+de\s+intermediacion|plan\s+personal\s+(?:para|de)\s+el\s+retiro|\bppr\b|\bafore\b|siefore|cuenta\s+individual|ahorro\s+voluntario|ahorro\s+para\s+el\s+retiro/.test(
      haystack,
    )
  const hasPayrollSignals = /nomina|payroll|salario|percepcion|deduccion|sueldos/.test(haystack)
  const hasStructuredPayrollSignals =
    /recibo\s+(?:de\s+)?nomina|cfdi|comprobante|fecha\s+(?:de\s+)?pago|periodo\s+(?:de\s+)?pago|total\s+percepciones|total\s+deducciones|tipo\s+nomina|dias\s+pagados/.test(
      haystack,
    )
  const hasPayrollFileName = /(?:^|[-_\s])(?:nomina|payroll)(?:[-_\s.]|$)/.test(normalizeForSearch(file.name))
  const hasRetirementSignals = /\bafore\b|siefore|consar|plan\s+personal\s+(?:para|de)\s+el\s+retiro|\bppr\b|ahorro\s+(?:para\s+el\s+retiro|voluntario)/.test(
    haystack,
  )
  const hasSavingsBankSignals = /cuenta\s+nu|cajita|sofipo|\bgat\b|ahorro\s+congelado/.test(haystack)
  const hasBankMovementSignals =
    /(depositos?|retiros?)/.test(haystack) && (preferredKind === 'bank_statement' || /(estado\s+de\s+cuenta|cuenta|saldo)/.test(haystack))
  const hasBankStatementSignals =
    hasSavingsBankSignals ||
    /estado\s+de\s+cuenta.*n[oó]mina|cuenta\s+n[oó]mina/.test(haystack) ||
    (/(dep[oó]sitos?|retiros?)/.test(haystack) && /(estado\s+de\s+cuenta|cuenta|saldo\s+(?:inicial|final|actual))/.test(haystack))

  if (preferredKind === 'credit_card_statement') {
    kind = 'credit_card_statement'
    reasons.push('schema de movimientos de tarjeta')
  } else if (preferredKind === 'bank_statement' && hasBankMovementSignals) {
    kind = 'bank_statement'
    reasons.push('senales de estado de cuenta con depositos y retiros')
  } else if (hasCardSignals) {
    kind = 'credit_card_statement'
    reasons.push('senales de tarjeta de credito')
  } else if (hasPayrollFileName || (hasPayrollSignals && hasStructuredPayrollSignals && !hasSavingsBankSignals)) {
    kind = 'payroll_cfdi'
    reasons.push('senales de nomina estructurada')
  } else if (hasInvestmentSignals) {
    kind = 'investment_statement'
    reasons.push('senales de inversion')
  } else if (hasBankStatementSignals) {
    kind = 'bank_statement'
    reasons.push('senales de estado de cuenta con depositos y retiros')
  } else if (hasStructuredPayrollSignals || (hasPayrollSignals && !hasRetirementSignals)) {
    kind = 'payroll_cfdi'
    reasons.push('senales de nomina')
  } else if (/cfdi|factura|folio fiscal|uuid|timbre fiscal|subtotal|iva/.test(haystack)) {
    kind = 'invoice_cfdi'
    reasons.push('senales de factura cfdi')
  } else if (/ticket|recibo|receipt|compra|total\s*\$|metodo de pago/.test(haystack)) {
    kind = 'purchase_receipt'
    reasons.push('senales de ticket o recibo de compra')
  } else if (/estado de cuenta|cuenta\s+nu|cajita|sofipo|gat|saldo|deposito|retiro|spei|clabe|ahorro/.test(haystack)) {
    kind = 'bank_statement'
    reasons.push('senales de estado de cuenta bancario')
  }

  const confidence = Math.min(0.95, 0.45 + reasons.length * 0.25 + (preferredKind && kind === preferredKind ? 0.15 : 0))
  return {
    kind,
    confidence: Number(confidence.toFixed(2)),
    reasons: reasons.length ? reasons : ['clasificacion por extension y contenido disponible'],
  }
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function moneyFromPatterns(text: string, patterns: RegExp[]) {
  const value = firstMatch(text, patterns)
  return value ? parseMoney(value) : undefined
}

function percentFromPatterns(text: string, patterns: RegExp[]) {
  const value = firstMatch(text, patterns)
  if (!value) return undefined
  const parsed = Number(value.replace(/[^0-9.,-]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function numberFromPatterns(text: string, patterns: RegExp[]) {
  const value = firstMatch(text, patterns)
  return value ? Math.abs(parseMoney(value)) : undefined
}

function dateFromPatterns(text: string, patterns: RegExp[]) {
  return normalizeDate(firstMatch(text, patterns))
}

function dateCandidates(text: string) {
  return [
    ...new Set(
      [...text.matchAll(/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+(?:de\s+)?[a-z]{3,10}\.?\s+(?:de\s+)?\d{2,4})\b/gi)]
        .map((match) => normalizeDate(match[0] ?? ''))
        .filter(Boolean),
    ),
  ]
}

function payrollMoneyCandidates(text: string) {
  return [...text.matchAll(/\$\s*(?:-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/g)]
    .map((match) => parseMoney(match[0] ?? ''))
    .filter((value) => Number.isFinite(value))
}

function payrollDateFacts(text: string, normalized: string) {
  const paymentDate = dateFromPatterns(normalized, [
    /fecha\s*(?:de\s*)?pago(?:\s*(?:de\s*)?nomina)?[^\d]{0,80}(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+(?:de\s+)?[a-z]+\s+(?:de\s+)?\d{2,4})/,
    /fecha\s*(?:de\s*)?deposito[^\d]{0,80}(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+(?:de\s+)?[a-z]+\s+(?:de\s+)?\d{2,4})/,
  ])
  const periodStart = dateFromPatterns(normalized, [
    /fecha\s*(?:de\s*)?(?:inicio|inicial)(?:\s*(?:de\s*)?pago)?[^\d]{0,80}(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+(?:de\s+)?[a-z]+\s+(?:de\s+)?\d{2,4})/,
    /periodo(?:\s+de\s+pago)?\s*(?:del|de)?\s*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})\s*(?:al|a|hasta|-)/,
  ])
  const periodEnd = dateFromPatterns(normalized, [
    /fecha\s*(?:de\s*)?(?:fin|final|termino)(?:\s*(?:de\s*)?pago)?[^\d]{0,80}(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+(?:de\s+)?[a-z]+\s+(?:de\s+)?\d{2,4})/,
    /periodo(?:\s+de\s+pago)?\s*(?:del|de)?\s*\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4}\s*(?:al|a|hasta|-)\s*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/,
  ])
  const tableFacts: Record<'paymentDate' | 'periodStart' | 'periodEnd', string> = {
    paymentDate: '',
    periodStart: '',
    periodEnd: '',
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const labels = normalizeForSearch(lines[index] ?? '')
    const orderedKeys = [
      ...(labels.includes('fecha de pago') || labels.includes('fecha pago') || labels.includes('fechapago') ? ['paymentDate'] : []),
      ...(labels.includes('fecha inicio') || labels.includes('fecha inicial') || labels.includes('fechainicio') || labels.includes('fechainicial') ? ['periodStart'] : []),
      ...(labels.includes('fecha fin') || labels.includes('fecha final') || labels.includes('fecha termino') || labels.includes('fechafin') || labels.includes('fechafinal') || labels.includes('fechatermino') ? ['periodEnd'] : []),
    ] as Array<keyof typeof tableFacts>
    if (!orderedKeys.length) continue
    const values = dateCandidates(lines.slice(index + 1, index + 4).join(' '))
    orderedKeys.forEach((key, valueIndex) => {
      if (values[valueIndex]) tableFacts[key] = values[valueIndex]
    })
  }

  const resolved = {
    paymentDate: tableFacts.paymentDate || paymentDate,
    periodStart: tableFacts.periodStart || periodStart,
    periodEnd: tableFacts.periodEnd || periodEnd,
  }
  return resolved.periodStart && resolved.periodEnd && resolved.periodStart > resolved.periodEnd
    ? { ...resolved, periodStart: '', periodEnd: '' }
    : resolved
}

function payrollEmployerCandidate(value: string) {
  const candidate = value
    .replace(/\s*(?:\||,|;)?\s*(?:r\.?\s*f\.?\s*c\.?|rfc)\b.*$/i, '')
    .replace(/^comprobante\s+fiscal\s+digital\s+por\s+internet\s*/i, '')
    .replace(/\s+fecha\s*[:-].*$/i, '')
    .replace(/\s+\b(?:cuenta|clabe|dias\s+pagados|rfc)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const letters = (candidate.match(/[a-z]/gi) ?? []).length
  const digits = (candidate.match(/\d/g) ?? []).length
  if (candidate.length < 3 || letters < 3 || digits > letters) return ''
  if (/\b(?:rfc|certificado|folio|uuid|sello\s+digital|cadena\s+original|serie)\b/i.test(candidate)) return ''
  return candidate.slice(0, 100)
}

function payrollEmployerName(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const employerLabel = /razon\s+social|nombre\s+(?:del\s+)?emisor|nombre\s+empresa|empleador|patron|empresa/

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (!employerLabel.test(normalizeForSearch(line))) continue
    const inline = payrollEmployerCandidate(line.split(/[:|]/).slice(1).join(' '))
    if (inline) return inline
    for (const candidateLine of lines.slice(index + 1, index + 3)) {
      const candidate = payrollEmployerCandidate(candidateLine.split('|')[0] ?? '')
      if (candidate) return candidate
    }
  }

  for (const line of lines) {
    const match = line.match(/^(.{3,100}?)\s+(?:r\.?\s*f\.?\s*c\.?|rfc)\b/i)
    const candidate = payrollEmployerCandidate(match?.[1] ?? '')
    if (candidate) return candidate
  }
  return ''
}

function payrollAmountFacts(text: string, normalized: string) {
  const grossPay = moneyFromPatterns(normalized, [/total\s+percepciones[^\d-]*(-?[\d,.]+)/, /percepciones[^\d-]*(-?[\d,.]+)/])
  const totalDeductions = moneyFromPatterns(normalized, [/total\s+deducciones[^\d-]*(-?[\d,.]+)/, /deducciones[^\d-]*(-?[\d,.]+)/])
  const totalOtherPayments = moneyFromPatterns(normalized, [/total\s+otros\s+pagos[^\d-]*(-?[\d,.]+)/])
  const netIncome = moneyFromPatterns(normalized, [
    /(?:neto\s+(?:pagado|a\s+pagar)|(?:importe|total)\s+neto|neto\s+recibido|liquido\s+a\s+pagar|total\s+a\s+(?:recibir|pagar)|cantidad\s+a\s+pagar)[^\d-]*(-?[\d,.]+)/,
    /total\s+(?:pagado|nomina)[^\d-]*(-?[\d,.]+)/,
  ])
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const labels = normalizeForSearch(lines.slice(index, index + 2).join(' '))
    if (!labels.includes('percepciones') || !labels.includes('deducciones') || !labels.includes('neto')) continue
    const values = lines
      .slice(index + 2, index + 6)
      .map((line) => payrollMoneyCandidates(line))
      .find((lineValues) => lineValues.length >= 3) ?? []
    if (values.length < 3) continue
    return {
      grossPay: values[0] ?? grossPay,
      totalDeductions: values.at(-2) ?? totalDeductions,
      totalOtherPayments: values.length >= 4 ? values[1] ?? totalOtherPayments : totalOtherPayments,
      netIncome: values.at(-1) ?? netIncome,
    }
  }

  return { grossPay, totalDeductions, totalOtherPayments, netIncome }
}

function last4FromPatterns(text: string, patterns: RegExp[]) {
  const value = firstMatch(text, patterns).replace(/\D/g, '')
  return value.length >= 4 ? value.slice(-4) : ''
}

function cleanPositionFact(position: PositionFact) {
  return Object.fromEntries(
    Object.entries(position).filter(([, value]) => {
      if (value === undefined || value === '') return false
      if (typeof value === 'number' && !Number.isFinite(value)) return false
      return true
    }),
  ) as PositionFact
}

function statementDirectionFromDescription(description: string): 'deposit' | 'withdrawal' | '' {
  const value = normalizeForSearch(description)
  if (
    /pago\s+(?:tarjeta|tdc|amex|nu)|spei\s+(?:enviado|salida)|transferencia\s+(?:enviada|a\s+terceros)|traspaso\s+a\s+|retiro\s+(?:cajero|atm|efectivo|ventanilla)|disposici[oó]n\s+(?:cajero|efectivo)|cargo\s+domiciliado/.test(
      value,
    )
  ) {
    return 'withdrawal'
  }
  if (/dep[oó]sito|abono|spei\s+recibido|transferencia\s+recibida|n[oó]mina|nomina|sueldo|salario|rendimiento|inter[eé]s/.test(value)) {
    return 'deposit'
  }
  return ''
}

function extractPositionFacts(text: string) {
  const positions = [...text.matchAll(/posici[oó]n\s*:\s*([^|]+?)\s*\|\s*(?:tipo|instrumento)\s*:\s*([^|]+?)\s*\|\s*(?:t[ií]tulos?|cantidad)\s*:\s*([\d,.]+)\s*\|\s*precio\s*:\s*\$?\s*([\d,.]+)\s*\|\s*valor\s*:\s*\$?\s*([\d,.]+)(?:\s*\|\s*(?:ganancia|plusval[ií]a|rendimiento)\s*:\s*\$?\s*(-?[\d,.]+))?(?=\s+posici[oó]n\s*:|\s+subcuenta\s*:|$)/gi)]
    .slice(0, 50)
    .map((match) =>
      cleanPositionFact({
        name: (match[1] ?? '').trim(),
        instrumentType: (match[2] ?? '').trim().toUpperCase(),
        quantity: numberFromPatterns(match[3] ?? '', [/([\d,.]+)/]),
        price: parseMoney(match[4] ?? ''),
        marketValue: parseMoney(match[5] ?? ''),
        unrealizedGain: match[6] ? parseMoney(match[6]) : undefined,
      }),
    )

  const subaccountPositions = [
    ...text.matchAll(
      /subcuenta\s*:\s*([^|]+?)\s*\|\s*saldo\s*:\s*\$?\s*([\d,.]+)(?:\s*\|\s*aportaciones?\s*:\s*\$?\s*([\d,.]+))?(?:\s*\|\s*retiros?\s*:\s*\$?\s*([\d,.]+))?(?:\s*\|\s*rendimiento\s*:\s*\$?\s*(-?[\d,.]+))?/gi,
    ),
  ]
    .slice(0, 50)
    .map((match) =>
      cleanPositionFact({
        name: (match[1] ?? '').trim(),
        balance: parseMoney(match[2] ?? ''),
        contributions: match[3] ? parseMoney(match[3]) : undefined,
        withdrawals: match[4] ? parseMoney(match[4]) : undefined,
        periodReturn: match[5] ? parseMoney(match[5]) : undefined,
      }),
    )

  const positionsMarketValue = positions.reduce((sum, position) => sum + (typeof position.marketValue === 'number' ? position.marketValue : 0), 0)
  const subaccountBalanceTotal = subaccountPositions.reduce((sum, position) => sum + (typeof position.balance === 'number' ? position.balance : 0), 0)

  return cleanFacts({
    positions,
    positionRows: positions.length || undefined,
    positionsMarketValue: positions.length ? Number(positionsMarketValue.toFixed(2)) : undefined,
    subaccountPositions,
    subaccountRows: subaccountPositions.length || undefined,
    subaccountBalanceTotal: subaccountPositions.length ? Number(subaccountBalanceTotal.toFixed(2)) : undefined,
  })
}

function buildStatementMovementRow(dateValue: string, descriptionValue: string, depositValue: string, withdrawalValue: string, balanceValue: string) {
  const deposit = Math.abs(parseMoney(depositValue))
  const withdrawal = Math.abs(parseMoney(withdrawalValue))
  if (deposit > 0 && withdrawal > 0) return null
  const amount = deposit > 0 ? deposit : withdrawal > 0 ? -withdrawal : 0
  const description = sanitizeImportedText(descriptionValue)
  const movement = classifyFinancialMovement(description, amount, 'checking', amount >= 0 ? 'income' : 'expense')
  return cleanPositionFact({
    date: normalizeDate(dateValue),
    description,
    deposit: deposit || undefined,
    withdrawal: withdrawal || undefined,
    balance: parseMoney(balanceValue),
    amount,
    movementType: movement.type,
    category: movement.category,
  })
}

function buildStatementSignedMovementRow(
  dateValue: string,
  descriptionValue: string,
  amountValue: string,
  balanceValue: string,
  previousBalance: number | undefined,
) {
  const rawAmount = parseMoney(amountValue)
  const balance = parseMoney(balanceValue)
  if (!rawAmount) return null
  const balanceInferredAmount = inferBankAmountFromBalanceDelta(rawAmount, previousBalance, balance)
  const direction = statementDirectionFromDescription(descriptionValue)
  const amount = balanceInferredAmount?.amount ?? (direction === 'withdrawal' ? -Math.abs(rawAmount) : direction === 'deposit' ? Math.abs(rawAmount) : rawAmount)
  const deposit = amount > 0 ? amount : 0
  const withdrawal = amount < 0 ? Math.abs(amount) : 0
  const description = sanitizeImportedText(descriptionValue)
  const baseMovement = classifyFinancialMovement(description, amount, 'checking', amount >= 0 ? 'income' : 'expense')
  const movement =
    amount > 0 && hasPayrollContext(description) && baseMovement.type === 'income'
      ? { ...baseMovement, category: 'Nomina' }
      : baseMovement
  return cleanPositionFact({
    date: normalizeDate(dateValue),
    description,
    deposit: deposit || undefined,
    withdrawal: withdrawal || undefined,
    balance,
    amount,
    movementType: movement.type,
    category: movement.category,
    amountSource: balanceInferredAmount ? balanceInferredAmount.source : direction ? `description_${direction}` : 'signed_amount',
  })
}

function extractBankStatementMovementFacts(text: string) {
  const normalized = normalizeForSearch(text)
  const explicitOpeningBalance = moneyFromPatterns(normalized, [/saldo\s+(?:inicial|anterior)[^\d-]*(-?[\d,.]+)/])
  const labeledRows = [
    ...text.matchAll(
      /movimiento\s*:\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*\|\s*(?:descripcion|descripci[oó]n|concepto)\s*:\s*([^|]+?)\s*\|\s*(?:dep[oó]sito|abono|entrada)\s*:\s*\$?\s*(-?[\d,.]+)\s*\|\s*(?:retiro|cargo|salida)\s*:\s*\$?\s*(-?[\d,.]+)\s*\|\s*saldo\s*:\s*\$?\s*(-?[\d,.]+)/gi,
    ),
  ]
    .map((match) => buildStatementMovementRow(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', match[5] ?? ''))
    .filter((row): row is PositionFact => Boolean(row))

  const tableSections = [
    ...text.matchAll(
      /(?:fecha|date)\s+(?:concepto|descripci[oó]n|descripcion|description|detalle)\s+(?:dep[oó]sito|deposito|abono|credit|cr[eé]dito)\s+(?:retiro|cargo|withdrawal|debit|d[eé]bito)\s+saldo([\s\S]{0,3000})/gi,
    ),
  ]
    .map((match) => match[1] ?? '')
    .join(' ')
  const tabularRows = [
    ...tableSections.matchAll(
      /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+([A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 .,&/+-]{3,90}?)\s+\$?(-?[\d.,]+)\s+\$?(-?[\d.,]+)\s+\$?(-?[\d.,]+)(?=\s+(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+|\s+(?:fecha|saldo\s+final|total|pagina|p[aá]gina|page|periodo)\b|$)/gi,
    ),
  ]
    .map((match) => buildStatementMovementRow(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', match[5] ?? ''))
    .filter((row): row is PositionFact => Boolean(row))

  const signedTableSections = [
    ...text.matchAll(
      /(?:fecha|date)\s+(?:concepto|descripci[oó]n|descripcion|description|detalle)\s+(?:monto|importe|amount)\s+saldo([\s\S]{0,3000})/gi,
    ),
  ]
    .map((match) => match[1] ?? '')
    .join(' ')
  let previousSignedBalance = explicitOpeningBalance
  const signedAmountRows = [
    ...signedTableSections.matchAll(
      /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+([A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 .,&/+-]{3,90}?)\s+\$?(-?\(?[\d.,]+\)?)\s+\$?(-?[\d.,]+)(?=\s+(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+|\s+(?:fecha|saldo\s+final|total|pagina|p[aá]gina|page|periodo)\b|$)/gi,
    ),
  ]
    .map((match) => {
      const row = buildStatementSignedMovementRow(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', previousSignedBalance)
      previousSignedBalance = parseMoney(match[4] ?? '')
      return row
    })
    .filter((row): row is PositionFact => Boolean(row))

  const seen = new Set<string>()
  const rows = [...labeledRows, ...tabularRows, ...signedAmountRows]
    .filter((row) => row.date && typeof row.amount === 'number' && row.amount !== 0)
    .filter((row) => {
      const key = `${row.date}|${row.description}|${Math.round(Number(row.amount) * 100)}|${Math.round(Number(row.balance ?? 0) * 100)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 80)

  const depositsTotal = rows.reduce((sum, row) => sum + (typeof row.deposit === 'number' ? row.deposit : 0), 0)
  const withdrawalsTotal = rows.reduce((sum, row) => sum + (typeof row.withdrawal === 'number' ? row.withdrawal : 0), 0)
  const depositRows = rows.filter((row) => typeof row.deposit === 'number' && row.deposit > 0).length
  const withdrawalRows = rows.filter((row) => typeof row.withdrawal === 'number' && row.withdrawal > 0).length
  const payrollAccountContext = /cuenta\s+(?:de\s+)?n[oó]mina|estado\s+de\s+cuenta\s+n[oó]mina|n[oó]mina\s+(?:cuenta|bancaria|debito|d[eé]bito)|payroll\s+account/i.test(text)
  const payrollDepositRows = rows.filter((row) => row.category === 'Nomina' && typeof row.deposit === 'number' && row.deposit > 0).length
  const payrollDepositTotal = rows.reduce((sum, row) => sum + (row.category === 'Nomina' && typeof row.deposit === 'number' ? row.deposit : 0), 0)
  const incomeRows = rows.filter((row) => row.movementType === 'income').length
  const expenseRows = rows.filter((row) => row.movementType === 'expense').length
  const transferRows = rows.filter((row) => row.movementType === 'transfer').length
  const debtPaymentRows = rows.filter((row) => row.movementType === 'debt_payment').length
  const incomeTotal = rows.reduce((sum, row) => sum + (row.movementType === 'income' && typeof row.amount === 'number' ? Math.max(0, row.amount) : 0), 0)
  const expenseTotal = rows.reduce((sum, row) => sum + (row.movementType === 'expense' && typeof row.amount === 'number' ? Math.abs(row.amount) : 0), 0)
  const transferInTotal = rows.reduce((sum, row) => sum + (row.movementType === 'transfer' && typeof row.amount === 'number' && row.amount > 0 ? row.amount : 0), 0)
  const transferOutTotal = rows.reduce((sum, row) => sum + (row.movementType === 'transfer' && typeof row.amount === 'number' && row.amount < 0 ? Math.abs(row.amount) : 0), 0)
  const debtPaymentTotal = rows.reduce((sum, row) => sum + (row.movementType === 'debt_payment' && typeof row.amount === 'number' ? Math.abs(row.amount) : 0), 0)
  const payrollAccountDepositRows = payrollAccountContext ? depositRows : payrollDepositRows
  const payrollAccountWithdrawalRows = payrollAccountContext ? withdrawalRows : 0
  const balanceDeltaInferredRows = rows.filter((row) => typeof row.amountSource === 'string' && String(row.amountSource).startsWith('balance_delta')).length
  const signedAmountRowsCount = rows.filter((row) => row.amountSource === 'signed_amount').length
  const descriptionInferredRows = rows.filter((row) => typeof row.amountSource === 'string' && String(row.amountSource).startsWith('description_')).length

  return cleanFacts({
    statementMovementRows: rows,
    statementMovementRowCount: rows.length || undefined,
    statementMovementDepositRows: depositRows || undefined,
    statementMovementWithdrawalRows: withdrawalRows || undefined,
    statementMovementDepositsTotal: rows.length ? Number(depositsTotal.toFixed(2)) : undefined,
    statementMovementWithdrawalsTotal: rows.length ? Number(withdrawalsTotal.toFixed(2)) : undefined,
    statementMovementNetCashFlow: rows.length ? Number((depositsTotal - withdrawalsTotal).toFixed(2)) : undefined,
    depositRows: depositRows || undefined,
    withdrawalRows: withdrawalRows || undefined,
    payrollDepositRows: payrollDepositRows || undefined,
    payrollDepositTotal: payrollDepositTotal ? Number(payrollDepositTotal.toFixed(2)) : undefined,
    payrollAccountDepositRows: payrollAccountDepositRows || undefined,
    payrollAccountWithdrawalRows: payrollAccountWithdrawalRows || undefined,
    payrollAccountMixedFlow: payrollAccountDepositRows > 0 && payrollAccountWithdrawalRows > 0,
    incomeRows: incomeRows || undefined,
    expenseRows: expenseRows || undefined,
    transferRows: transferRows || undefined,
    debtPaymentRows: debtPaymentRows || undefined,
    incomeTotal: rows.length ? Number(incomeTotal.toFixed(2)) : undefined,
    expenseTotal: rows.length ? Number(expenseTotal.toFixed(2)) : undefined,
    transferInTotal: rows.length ? Number(transferInTotal.toFixed(2)) : undefined,
    transferOutTotal: rows.length ? Number(transferOutTotal.toFixed(2)) : undefined,
    debtPaymentTotal: rows.length ? Number(debtPaymentTotal.toFixed(2)) : undefined,
    pdfBalanceDeltaInferredRows: balanceDeltaInferredRows || undefined,
    pdfSignedAmountRows: signedAmountRowsCount || undefined,
    pdfDescriptionInferredRows: descriptionInferredRows || undefined,
  })
}

function cardDirectionFromDescription(description: string): 'charge' | 'payment' | 'credit' {
  const value = normalizeForSearch(description)
  if (/pago|abono|payment|recibido|received/.test(value)) return 'payment'
  if (/devoluci[oó]n|reembolso|bonificaci[oó]n|ajuste|credito|credit|refund/.test(value)) return 'credit'
  return 'charge'
}

function buildCreditCardMovementRow(dateValue: string, descriptionValue: string, chargeValue: string, paymentValue: string, creditValue: string) {
  const charge = Math.abs(parseMoney(chargeValue))
  const payment = Math.abs(parseMoney(paymentValue))
  const credit = Math.abs(parseMoney(creditValue))
  const populatedAmounts = [charge, payment, credit].filter((value) => value > 0).length
  if (populatedAmounts !== 1) return null
  const amount = charge > 0 ? -charge : payment > 0 ? payment : credit
  const description = sanitizeImportedText(descriptionValue)
  const preferredType: Transaction['type'] = charge > 0 ? 'expense' : payment > 0 ? 'debt_payment' : 'transfer'
  const movement = classifyFinancialMovement(description, amount, 'credit_card', preferredType)
  return cleanPositionFact({
    date: normalizeDate(dateValue),
    description,
    charge: charge || undefined,
    payment: payment || undefined,
    credit: credit || undefined,
    amount,
    movementType: movement.type,
    category: movement.category,
  })
}

function buildCreditCardSignedMovementRow(
  dateValue: string,
  descriptionValue: string,
  amountValue: string,
  balanceValue: string,
  previousBalance: number | undefined,
) {
  const rawAmount = parseMoney(amountValue)
  const balance = parseMoney(balanceValue)
  if (!rawAmount) return null
  const absoluteAmount = Math.abs(rawAmount)
  const delta = previousBalance === undefined ? undefined : Number((balance - previousBalance).toFixed(2))
  const inferredDirection =
    delta !== undefined && Math.abs(delta - absoluteAmount) <= 0.01
      ? 'charge'
      : delta !== undefined && Math.abs(delta + absoluteAmount) <= 0.01
        ? cardDirectionFromDescription(descriptionValue) === 'credit'
          ? 'credit'
          : 'payment'
        : rawAmount < 0
          ? cardDirectionFromDescription(descriptionValue) === 'credit'
            ? 'credit'
            : 'payment'
          : cardDirectionFromDescription(descriptionValue)
  const charge = inferredDirection === 'charge' ? absoluteAmount : 0
  const payment = inferredDirection === 'payment' ? absoluteAmount : 0
  const credit = inferredDirection === 'credit' ? absoluteAmount : 0
  const amount = charge > 0 ? -charge : payment > 0 ? payment : credit
  const description = sanitizeImportedText(descriptionValue)
  const preferredType: Transaction['type'] = charge > 0 ? 'expense' : payment > 0 ? 'debt_payment' : 'transfer'
  const movement = classifyFinancialMovement(description, amount, 'credit_card', preferredType)
  return cleanPositionFact({
    date: normalizeDate(dateValue),
    description,
    charge: charge || undefined,
    payment: payment || undefined,
    credit: credit || undefined,
    balance,
    amount,
    movementType: movement.type,
    category: movement.category,
    amountSource: delta === undefined ? 'signed_amount' : 'balance_delta_card',
  })
}

function extractCreditCardMovementFacts(text: string) {
  const tableSections = [
    ...text.matchAll(
      /(?:fecha|date)\s+(?:concepto|descripci[oó]n|descripcion|description|detalle|comercio)\s+(?:cargo|cargos|compra|compras|charge)\s+(?:pago|pagos|abono|abonos|payment)\s+(?:cr[eé]dito|credito|bonificaci[oó]n|ajuste|credit)([\s\S]{0,3000})/gi,
    ),
  ]
    .map((match) => match[1] ?? '')
    .join(' ')
  const rows = [
    ...tableSections.matchAll(
      /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+([A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 .,&/+-]{3,90}?)\s+\$?(-?[\d.,]+)\s+\$?(-?[\d.,]+)\s+\$?(-?[\d.,]+)(?=\s+(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+|\s+(?:fecha|saldo|total|pagina|p[aá]gina|page|periodo|cat)\b|$)/gi,
    ),
  ]
    .map((match) => buildCreditCardMovementRow(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', match[5] ?? ''))
    .filter((row): row is PositionFact => Boolean(row))
  const signedTableSections = [
    ...text.matchAll(
      /(?:fecha|date)\s+(?:concepto|descripci[oó]n|descripcion|description|detalle|comercio)\s+(?:monto|importe|amount)\s+saldo([\s\S]{0,3000})/gi,
    ),
  ]
    .map((match) => match[1] ?? '')
    .join(' ')
  const previousBalance = moneyFromPatterns(normalizeForSearch(text), [/saldo\s+(?:anterior|previo)[^\d-]*(-?[\d,.]+)/])
  let previousSignedBalance = previousBalance
  const signedAmountRows = [
    ...signedTableSections.matchAll(
      /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+([A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 .,&/+-]{3,90}?)\s+\$?(-?\(?[\d.,]+\)?)\s+\$?(-?[\d.,]+)(?=\s+(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+|\s+(?:fecha|saldo|total|pagina|p[aá]gina|page|periodo|cat)\b|$)/gi,
    ),
  ]
    .map((match) => {
      const row = buildCreditCardSignedMovementRow(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', previousSignedBalance)
      previousSignedBalance = parseMoney(match[4] ?? '')
      return row
    })
    .filter((row): row is PositionFact => Boolean(row))

  const seen = new Set<string>()
  const dedupedRows = [...rows, ...signedAmountRows]
    .filter((row) => row.date && typeof row.amount === 'number' && row.amount !== 0)
    .filter((row) => {
      const key = `${row.date}|${row.description}|${Math.round(Number(row.amount) * 100)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 120)

  const chargesTotal = dedupedRows.reduce((sum, row) => sum + (typeof row.charge === 'number' ? row.charge : 0), 0)
  const paymentsTotal = dedupedRows.reduce((sum, row) => sum + (typeof row.payment === 'number' ? row.payment : 0), 0)
  const creditsTotal = dedupedRows.reduce((sum, row) => sum + (typeof row.credit === 'number' ? row.credit : 0), 0)
  const chargesRows = dedupedRows.filter((row) => typeof row.charge === 'number' && row.charge > 0).length
  const paymentsRows = dedupedRows.filter((row) => typeof row.payment === 'number' && row.payment > 0).length
  const creditsRows = dedupedRows.filter((row) => typeof row.credit === 'number' && row.credit > 0).length
  const balanceDeltaRows = dedupedRows.filter((row) => row.amountSource === 'balance_delta_card').length

  return cleanFacts({
    cardMovementRows: dedupedRows,
    cardMovementRowCount: dedupedRows.length || undefined,
    cardChargesRows: chargesRows || undefined,
    cardPaymentsRows: paymentsRows || undefined,
    cardCreditsRows: creditsRows || undefined,
    cardChargesTotal: dedupedRows.length ? Number(chargesTotal.toFixed(2)) : undefined,
    cardPaymentsTotal: dedupedRows.length ? Number(paymentsTotal.toFixed(2)) : undefined,
    cardCreditsTotal: dedupedRows.length ? Number(creditsTotal.toFixed(2)) : undefined,
    cardNetActivity: dedupedRows.length ? Number((chargesTotal - paymentsTotal - creditsTotal).toFixed(2)) : undefined,
    cardBalanceDeltaRows: balanceDeltaRows || undefined,
  })
}

function paymentScenarioName(value: string) {
  const normalized = normalizeForSearch(value)
  if (/m[ií]nimo.*(?:x|por)?\s*5|5\s*(?:x|veces)/.test(normalized)) return 'Pago minimo x5'
  if (/m[ií]nimo.*(?:x|por)?\s*2|2\s*(?:x|veces)/.test(normalized)) return 'Pago minimo x2'
  if (/pago\s+para\s+no\s+generar/.test(normalized)) return 'Pago para no generar intereses'
  if (/m[ií]nimo/.test(normalized)) return 'Pago minimo'
  return sanitizeImportedText(value)
}

function buildCreditCardPaymentScenario(nameValue: string, paymentValue: string, monthsValue: string, interestValue: string, totalValue = '') {
  const monthlyPayment = Math.abs(parseMoney(paymentValue))
  const monthsToPayoff = numberFromPatterns(monthsValue, [/([\d,.]+)/])
  const estimatedInterest = Math.abs(parseMoney(interestValue))
  const parsedTotalCost = totalValue ? Math.abs(parseMoney(totalValue)) : undefined
  const estimatedTotalCost = parsedTotalCost !== undefined && (!monthlyPayment || parsedTotalCost >= monthlyPayment) ? parsedTotalCost : undefined
  const scenarioName = paymentScenarioName(nameValue)
  if (!scenarioName || (!monthlyPayment && !monthsToPayoff && !estimatedInterest && !estimatedTotalCost)) return null
  return cleanPositionFact({
    scenarioName,
    monthlyPayment: monthlyPayment || undefined,
    monthsToPayoff: monthsToPayoff || undefined,
    estimatedInterest: interestValue.trim() ? estimatedInterest : undefined,
    estimatedTotalCost: estimatedTotalCost || undefined,
  })
}

function extractCreditCardPaymentScenarioFacts(text: string) {
  const normalized = normalizeForSearch(text)
  const sectionText = [
    ...text.matchAll(
      /(?:escenarios?\s+de\s+pago|si\s+paga|alternativas?\s+de\s+pago|comparativo\s+de\s+pago)([\s\S]{0,2200})/gi,
    ),
  ]
    .map((match) => match[1])
    .join(' ')

  const labeledRows = [
    ...text.matchAll(
      /escenario\s*:\s*([^|]+?)\s*\|\s*(?:pago|mensualidad)\s*:\s*\$?\s*(-?[\d,.]+)\s*\|\s*(?:meses|plazo)\s*:\s*([\d,.]+)\s*\|\s*(?:inter[eé]s(?:es)?|intereses\s+estimados?)\s*:\s*\$?\s*(-?[\d,.]+)(?:\s*\|\s*(?:total|costo\s+total)\s*:\s*\$?\s*(-?[\d,.]+))?/gi,
    ),
  ].map((match) => buildCreditCardPaymentScenario(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', match[5] ?? ''))

  const tabularRows = [
    ...sectionText.matchAll(
      /(pago\s+(?:m[ií]nimo(?:\s*(?:x|por)?\s*[25])?|para\s+no\s+generar\s+inter[eé]s(?:es)?)|m[ií]nimo\s*(?:x|por)?\s*[25])\s+\$?\s*(-?[\d,.]+)\s+([\d,.]+)\s+\$?\s*(-?[\d,.]+)(?:\s+\$?\s*(-?[\d,.]+))?/gi,
    ),
  ].map((match) => buildCreditCardPaymentScenario(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', match[5] ?? ''))

  const seen = new Set<string>()
  const scenarios = [...labeledRows, ...tabularRows]
    .filter((row): row is PositionFact => Boolean(row))
    .filter((row) => {
      const key = `${row.scenarioName}|${row.monthlyPayment}|${row.monthsToPayoff}|${row.estimatedInterest}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
  const scenarioTextDetected = /escenarios?\s+de\s+pago|meses\s+para\s+liquidar|inter[eé]s(?:es)?\s+estimad/.test(normalized)

  const validInterestScenarios = scenarios.filter((row) => typeof row.estimatedInterest === 'number')
  const minimumInterest = validInterestScenarios.reduce(
    (best, row) => (typeof row.estimatedInterest === 'number' && row.estimatedInterest < best ? row.estimatedInterest : best),
    Number.POSITIVE_INFINITY,
  )
  const minimumScenario = validInterestScenarios.find((row) => row.estimatedInterest === minimumInterest)
  const minimumPaymentScenario = scenarios.find((row) => String(row.scenarioName).toLowerCase() === 'pago minimo')
  const maxSavings =
    typeof minimumPaymentScenario?.estimatedInterest === 'number' && Number.isFinite(minimumInterest)
      ? Number((minimumPaymentScenario.estimatedInterest - minimumInterest).toFixed(2))
      : undefined

  return cleanFacts({
    cardPaymentScenarios: scenarios,
    cardPaymentScenarioRows: scenarios.length || undefined,
    cardLowestInterestScenario: typeof minimumScenario?.scenarioName === 'string' ? minimumScenario.scenarioName : undefined,
    cardLowestEstimatedInterest: Number.isFinite(minimumInterest) ? Number(minimumInterest.toFixed(2)) : undefined,
    cardMaxInterestSavings: maxSavings && maxSavings > 0 ? maxSavings : undefined,
    cardPaymentScenarioDetected: scenarios.length > 0 || scenarioTextDetected ? true : undefined,
  })
}

function extractSpeiFacts(text: string) {
  const normalized = normalizeForSearch(text)
  const speiDetected = /\bspei\b|clave\s+de\s+rastreo|\bcep\b|comprobante\s+electr[oó]nico\s+de\s+pago/.test(normalized)
  if (!speiDetected) return {}

  return cleanFacts({
    speiDetected,
    speiTraceKey: firstMatch(normalized, [
      /clave\s+de\s+rastreo\s*:?\s*([a-z0-9-]{6,30})/,
      /\bcep\b[^\w]{0,12}([a-z0-9-]{6,30})/,
    ]),
    speiReferenceNumber: firstMatch(normalized, [/(?:n[uú]mero\s+de\s+referencia|referencia)\s*:?\s*(\d{1,7})/]),
    speiIssuerInstitution: firstMatch(normalized, [
      /instituci[oó]n\s+emisora(?:\s+del\s+pago)?\s*:?\s*([a-z0-9 .&-]{2,50}?)(?=\s+(?:instituci[oó]n|cuenta|monto|fecha|pago|clave|referencia)\b|$)/,
      /banco\s+emisor\s*:?\s*([a-z0-9 .&-]{2,50}?)(?=\s+(?:banco|cuenta|monto|fecha|pago|clave|referencia)\b|$)/,
    ]),
    speiReceiverInstitution: firstMatch(normalized, [
      /instituci[oó]n\s+receptora(?:\s+del\s+pago)?\s*:?\s*([a-z0-9 .&-]{2,50}?)(?=\s+(?:instituci[oó]n|cuenta|monto|fecha|pago|clave|referencia)\b|$)/,
      /banco\s+receptor\s*:?\s*([a-z0-9 .&-]{2,50}?)(?=\s+(?:banco|cuenta|monto|fecha|pago|clave|referencia)\b|$)/,
    ]),
    speiBeneficiaryAccountLast4: last4FromPatterns(normalized, [/(?:cuenta\s+beneficiaria|clabe\s+beneficiaria)[^\d]*(\d{4,18})/]),
    speiPaymentAmount: moneyFromPatterns(normalized, [/(?:monto\s+del\s+pago|monto\s+spei)[^\d-]*(-?[\d,.]+)/]),
  })
}

function isRetirementText(value: string) {
  const normalized = normalizeForSearch(value)
  return /\bppr\b|plan\s+personal\s+(?:para|de)\s+el\s+retiro|\bafore\b|siefore|consar|cuenta\s+individual|ahorro\s+(?:para\s+el\s+retiro|voluntario)|aportaciones?\s+voluntarias?|subcuentas?/.test(
    normalized,
  )
}

function cleanFacts(facts: ExtractedFacts): ExtractedFacts {
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false
      if (typeof value === 'number' && !Number.isFinite(value)) return false
      return !(Array.isArray(value) && value.length === 0)
    }),
  )
}

function finiteNumberFact(facts: ExtractedFacts, key: string) {
  const value = facts[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function creditCardReconciliationFacts(facts: ExtractedFacts): ExtractedFacts {
  const previousBalance = finiteNumberFact(facts, 'previousBalance')
  const newCharges = finiteNumberFact(facts, 'newCharges') ?? finiteNumberFact(facts, 'cardChargesTotal')
  const deferredAmortization = finiteNumberFact(facts, 'deferredAmortization') ?? 0
  const cardPaymentCreditsAmount =
    (finiteNumberFact(facts, 'cardPaymentsTotal') ?? 0) + (finiteNumberFact(facts, 'cardCreditsTotal') ?? 0)
  const paymentsAmount = finiteNumberFact(facts, 'paymentsAmount') ?? cardPaymentCreditsAmount
  const interestAmount = finiteNumberFact(facts, 'interestAmount') ?? 0
  const feesAmount = finiteNumberFact(facts, 'feesAmount') ?? 0
  const vatAmount = finiteNumberFact(facts, 'vatAmount') ?? 0
  const financialCostsTotal = interestAmount + feesAmount + vatAmount
  const currentBalance = finiteNumberFact(facts, 'currentBalance') ?? finiteNumberFact(facts, 'totalDebtBalance')

  if (previousBalance === undefined || newCharges === undefined || currentBalance === undefined) {
    return {
      financialCostsTotal: Number(financialCostsTotal.toFixed(2)),
      cardReconciliationStatus: 'insufficient',
      cardReconciliationSeverity: 'medium',
      cardReconciliationMissing: [
        ...(previousBalance === undefined ? ['previousBalance'] : []),
        ...(newCharges === undefined ? ['newCharges'] : []),
        ...(currentBalance === undefined ? ['currentBalance'] : []),
      ],
    }
  }

  const expectedBalance = previousBalance + newCharges + deferredAmortization + financialCostsTotal - paymentsAmount
  const difference = Number((currentBalance - expectedBalance).toFixed(2))
  const tolerance = 1
  const status = Math.abs(difference) <= tolerance ? 'balanced' : 'mismatch'
  return {
    financialCostsTotal: Number(financialCostsTotal.toFixed(2)),
    cardReconciliationExpectedBalance: Number(expectedBalance.toFixed(2)),
    cardReconciliationDifference: difference,
    cardReconciliationTolerance: tolerance,
    cardReconciliationStatus: status,
    cardReconciliationSeverity: status === 'balanced' ? 'ok' : 'high',
  }
}

function extractFinancialDocumentFacts(kind: DocumentKind, text: string): ExtractedFacts {
  const normalized = normalizeForSearch(text)
  const common = cleanFacts({
    statementDate: dateFromPatterns(normalized, [/fecha\s+(?:de\s+)?(?:emision|expedicion|estado)[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
    periodStart: dateFromPatterns(normalized, [/periodo\s+(?:del|de)?\s*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})\s+(?:al|a)/]),
    periodEnd: dateFromPatterns(normalized, [/periodo\s+(?:del|de)?\s*\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4}\s+(?:al|a)\s*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
    accountLast4: last4FromPatterns(normalized, [
      /(?:cuenta|clabe|contrato|tarjeta)[^\d]*(\d{4,18})/,
      /(?:terminacion|termina|finaliza)[^\d]*(\d{4})/,
    ]),
  })

  if (kind === 'payroll_cfdi') {
    const payrollDates = payrollDateFacts(text, normalized)
    const payrollAmounts = payrollAmountFacts(text, normalized)
    const derivedNetIncome =
      payrollAmounts.grossPay !== undefined && payrollAmounts.totalDeductions !== undefined && payrollAmounts.grossPay >= 100 && payrollAmounts.grossPay > payrollAmounts.totalDeductions
        ? Number((payrollAmounts.grossPay - payrollAmounts.totalDeductions + (payrollAmounts.totalOtherPayments ?? 0)).toFixed(2))
        : undefined
    return cleanFacts({
      ...common,
      ...payrollDates,
      employerName: payrollEmployerName(text),
      grossPay: payrollAmounts.grossPay,
      totalDeductions: payrollAmounts.totalDeductions,
      totalOtherPayments: payrollAmounts.totalOtherPayments,
      netIncome: payrollAmounts.netIncome ?? derivedNetIncome,
      isrDetected: /\bisr\b|impuesto\s+sobre\s+la\s+renta/.test(normalized),
      imssDetected: /\bimss\b|seguro\s+social/.test(normalized),
      infonavitDetected: /infonavit|credito\s+vivienda/.test(normalized),
    })
  }

  if (kind === 'credit_card_statement') {
    const cardCostText = normalized.replace(/pago\s+para\s+no\s+generar\s+inter[eé]s(?:es)?[^\d-]*-?[\d,.]+/g, '')
    const cardMovementFacts = extractCreditCardMovementFacts(text)
    const cardPaymentScenarioFacts = extractCreditCardPaymentScenarioFacts(text)
    const cardFacts = cleanFacts({
      ...common,
      cutoffDate: dateFromPatterns(normalized, [/fecha\s+de\s+corte[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
      dueDate: dateFromPatterns(normalized, [/fecha\s+l[ií]mite\s+de\s+pago[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
      minimumPayment: moneyFromPatterns(normalized, [/pago\s+(?:minimo|m[ií]nimo|requerido\s+minimo)[^\d-]*(-?[\d,.]+)/]),
      minimumPaymentWithDeferred: moneyFromPatterns(normalized, [
        /pago\s+m[ií]nimo\s*\+\s*(?:compras|cargos|pagos)\s+diferid[oa]s?[^\d-]*(-?[\d,.]+)/,
        /m[ií]nimo\s+(?:con|mas|\+)\s+(?:msi|diferid[oa]s?)[^\d-]*(-?[\d,.]+)/,
      ]),
      noInterestPayment: moneyFromPatterns(normalized, [/pago\s+para\s+no\s+generar\s+inter[eé]s(?:es)?[^\d-]*(-?[\d,.]+)/]),
      creditLimit: moneyFromPatterns(normalized, [/l[ií]mite\s+de\s+cr[eé]dito[^\d-]*(-?[\d,.]+)/]),
      availableCredit: moneyFromPatterns(normalized, [/cr[eé]dito\s+disponible[^\d-]*(-?[\d,.]+)/]),
      currentBalance: moneyFromPatterns(normalized, [/saldo\s+(?:al\s+corte|actual|total)[^\d-]*(-?[\d,.]+)/]),
      totalDebtBalance: moneyFromPatterns(normalized, [/saldo\s+deudor\s+total[^\d-]*(-?[\d,.]+)/]),
      previousBalance: moneyFromPatterns(normalized, [/saldo\s+(?:anterior|previo)[^\d-]*(-?[\d,.]+)/]),
      newCharges: moneyFromPatterns(normalized, [/(?:total\s+de\s+)?(?:cargos|compras)[^\d-]*(-?[\d,.]+)/]),
      deferredAmortization: moneyFromPatterns(normalized, [
        /(?:cargos|compras|amortizaci[oó]n)\s+diferid[oa]s?[^\d-]*(-?[\d,.]+)/,
        /parcialidades?[^\d-]*(-?[\d,.]+)/,
      ]),
      paymentsAmount: moneyFromPatterns(normalized, [/(?:total\s+de\s+)?(?:pagos|abonos)[^\d-]*(-?[\d,.]+)/]),
      interestAmount: moneyFromPatterns(cardCostText, [/inter[eé]s(?:es)?[^\d-]*(-?[\d,.]+)/]),
      feesAmount: moneyFromPatterns(normalized, [/comisi[oó]n(?:es)?[^\d-]*(-?[\d,.]+)/]),
      vatAmount: moneyFromPatterns(normalized, [/\biva\b[^\d-]*(-?[\d,.]+)/]),
      ordinaryAnnualRate: percentFromPatterns(normalized, [/tasa\s+(?:ordinaria\s+)?anual[^\d-]*([\d,.]+)\s*%/]),
      catPercent: percentFromPatterns(normalized, [/\bcat\b[^\d-]*([\d,.]+)\s*%/]),
      deferredDetected: /\bmsi\b|meses\s+sin\s+inter[eé]s|diferid[oa]|parcialidad|\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(normalized),
      disputeDetected: /cargo\s+no\s+reconocido|aclaraci[oó]n|disputa|folio\s+une|reclamaci[oó]n/.test(normalized),
    })
    const cardFactsForReconciliation = cleanFacts({ ...cardFacts, ...cardMovementFacts })
    return cleanFacts({
      ...cardFacts,
      ...cardMovementFacts,
      ...cardPaymentScenarioFacts,
      ...creditCardReconciliationFacts(cardFactsForReconciliation),
    })
  }

  if (kind === 'investment_statement') {
    const detectedInstruments = [
      ...new Set(
        [
          'cetes',
          'bonddia',
          'enerfin',
          'bondes',
          'udibono',
          'acciones',
          'etf',
          'fibras',
          'fondos',
          'smart cash',
          'trading mx',
          'trading usa',
          'ppr',
          'afore',
          'siefore',
          'reporto',
          'bonos',
          'rcv',
          'cesantia',
          'vejez',
        ].filter((term) => normalized.includes(term)),
      ),
    ]
    const retirementProduct = /\bppr\b|plan\s+personal\s+(?:para|de)\s+el\s+retiro/.test(normalized)
      ? 'PPR'
      : /\bafore\b|siefore|consar|cuenta\s+individual|ahorro\s+para\s+el\s+retiro/.test(normalized)
        ? 'AFORE'
        : undefined
    const investmentProduct = /smart\s+cash/.test(normalized)
      ? 'GBM Smart Cash'
      : /trading\s+usa|estados\s+unidos/.test(normalized)
        ? 'GBM Trading USA'
        : retirementProduct
          ? retirementProduct
          : /trading\s+(mx|mexico)|acciones|etf|fibras/.test(normalized)
          ? 'GBM Trading MX'
          : /cetesdirecto|cetes|bonddia|enerfin|bondes|udibono|valores\s+gubernamentales/.test(normalized)
            ? 'Cetesdirecto'
            : undefined
    const positionFacts = extractPositionFacts(normalized)
    return cleanFacts({
      ...common,
      ...positionFacts,
      investmentProduct,
      retirementProduct,
      portfolioValue: moneyFromPatterns(normalized, [
        /valor\s+(?:total|de\s+mercado|del\s+portafolio|de\s+la\s+cartera)[^\d-]*(-?[\d,.]+)/,
        /(?:inversi[oó]n|inversion)\s+total[^\d-]*(-?[\d,.]+)/,
        /valor\s+actual[^\d-]*(-?[\d,.]+)/,
        /saldo\s+(?:total|final|actual)[^\d-]*(-?[\d,.]+)/,
      ]),
      cashBalance: moneyFromPatterns(normalized, [/(?:efectivo|saldo\s+disponible|disponible\s+para\s+comprar)[^\d-]*(-?[\d,.]+)/]),
      availableToInvest: moneyFromPatterns(normalized, [/disponible\s+para\s+(?:invertir|comprar)[^\d-]*(-?[\d,.]+)/]),
      availableToWithdraw: moneyFromPatterns(normalized, [/disponible\s+para\s+(?:retirar|disponer)[^\d-]*(-?[\d,.]+)/]),
      periodReturn: moneyFromPatterns(normalized, [/rendimiento\s+(?:del\s+periodo|generado|mensual)[^\d-]*(-?[\d,.]+)/]),
      dailyReturn: moneyFromPatterns(normalized, [/rendimiento\s+diario[^\d-]*(-?[\d,.]+)/]),
      unrealizedGain: moneyFromPatterns(normalized, [/(?:ganancia|p[eé]rdida)\s+no\s+realizada[^\d-]*(-?[\d,.]+)/]),
      contributionsTotal: moneyFromPatterns(normalized, [/(?:aportaciones|dep[oó]sitos|fondeos)[^\d-]*(-?[\d,.]+)/]),
      investmentWithdrawalsTotal: moneyFromPatterns(normalized, [/(?:retiros|liquidaciones)[^\d-]*(-?[\d,.]+)/]),
      voluntaryContributions: moneyFromPatterns(normalized, [/aportaciones?\s+voluntarias?[^\d-]*(-?[\d,.]+)/, /ahorro\s+voluntario[^\d-]*(-?[\d,.]+)/]),
      mandatoryContributions: moneyFromPatterns(normalized, [/aportaciones?\s+obligatorias?[^\d-]*(-?[\d,.]+)/, /\brcv\b[^\d-]*(-?[\d,.]+)/]),
      employerContributions: moneyFromPatterns(normalized, [/aportaciones?\s+(?:patronales|del\s+patron)[^\d-]*(-?[\d,.]+)/]),
      governmentContributions: moneyFromPatterns(normalized, [/aportaciones?\s+(?:gobierno|estatales|cuota\s+social)[^\d-]*(-?[\d,.]+)/]),
      retirementWithdrawals: moneyFromPatterns(normalized, [/retiro\s+(?:de\s+)?ahorro\s+voluntario[^\d-]*(-?[\d,.]+)/, /retiros?\s+parciales?[^\d-]*(-?[\d,.]+)/]),
      commissionsAmount: moneyFromPatterns(normalized, [/comisi[oó]n(?:es)?[^\d-]*(-?[\d,.]+)/]),
      taxWithheld: moneyFromPatterns(normalized, [/(?:isr|retenci[oó]n|impuesto)[^\d-]*(-?[\d,.]+)/]),
      annualYieldPercent: percentFromPatterns(normalized, [/(?:gat|rendimiento\s+anual|tasa\s+anual|tasa\s+fija)[^\d-]*([\d,.]+)\s*%/]),
      netReturnIndicator: percentFromPatterns(normalized, [/indicador\s+de\s+rendimiento\s+neto[^\d-]*([\d,.]+)\s*%/, /rendimiento\s+neto[^\d-]*([\d,.]+)\s*%/]),
      currency: /\busd\b|d[oó]lares?/.test(normalized) ? 'USD' : /\bmxn\b|pesos?/.test(normalized) ? 'MXN' : undefined,
      market: /trading\s+usa|estados\s+unidos|mercado\s+estadounidense/.test(normalized)
        ? 'USA'
        : /trading\s+mx|mercado\s+mexicano|mexico/.test(normalized)
          ? 'MX'
          : undefined,
      liquidity: /liquidez\s+diaria|liquidez\s+24\s+horas|disponer\s+diariamente|sin\s+perder\s+liquidez|a\s+tu\s+alcance/.test(normalized)
        ? 'liquidez diaria'
        : undefined,
      settlementWindow: /24\s+horas|un\s+d[ií]a\s+h[aá]bil|t\+1/.test(normalized)
        ? '24 horas / 1 dia habil'
        : /48\s+horas|t\+2|liquidaci[oó]n\s+a\s+48/.test(normalized)
          ? '48 horas habiles'
          : undefined,
      instrumentType: firstMatch(normalized, [
        /\binstrumento[^\w]*(cetes|bonddia|enerfin|bondes|udibono|bonos)/,
        /\b(cetes|bonddia|enerfin|bondes|udibono|bonos)\b/,
      ]).toUpperCase(),
      titleCount: numberFromPatterns(normalized, [/(?:t[ií]tulos?|acciones?)\s*:\s*([\d,.]+)/]),
      purchaseDate: dateFromPatterns(normalized, [/fecha\s+de\s+(?:compra|adquisici[oó]n)[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
      maturityDate: dateFromPatterns(normalized, [/fecha\s+de\s+vencimiento[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/, /vencimiento[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
      termDays: numberFromPatterns(normalized, [/\bplazo[^\d]*([\d,.]+)\s+d[ií]as?/, /\b([\d,.]+)\s+d[ií]as?[^\n]{0,40}vencimiento/]),
      nominalValue: moneyFromPatterns(normalized, [/valor\s+nominal[^\d-]*(-?[\d,.]+)/]),
      marketValue: moneyFromPatterns(normalized, [/valor\s+(?:de\s+mercado|actual)[^\d-]*(-?[\d,.]+)/]),
      maturityValue: moneyFromPatterns(normalized, [/valor\s+al\s+vencimiento[^\d-]*(-?[\d,.]+)/]),
      fundName: firstMatch(normalized, [/fondo[^\w]*(bonddia|enerfin|[\w\s]{3,40})/]),
      dailyLiquidity: /liquidez\s+diaria|disponer\s+diariamente|vender\s+diariamente/.test(normalized),
      riskLevel: firstMatch(normalized, [/riesgo\s+(?:de\s+inversi[oó]n\s+)?(alto|medio|bajo)/]),
      retirementBalance: moneyFromPatterns(normalized, [/saldo\s+(?:total\s+)?(?:para\s+el\s+retiro|de\s+retiro)[^\d-]*(-?[\d,.]+)/, /saldo\s+total\s+afore[^\d-]*(-?[\d,.]+)/]),
      monthlyContribution: moneyFromPatterns(normalized, [/aportaci[oó]n\s+mensual[^\d-]*(-?[\d,.]+)/]),
      taxDeductibleAmount: moneyFromPatterns(normalized, [/(?:monto|aportaci[oó]n)\s+deducible[^\d-]*(-?[\d,.]+)/]),
      nonDeductibleContributions: moneyFromPatterns(normalized, [/aportaciones?\s+no\s+deducibles?[^\d-]*(-?[\d,.]+)/]),
      targetRetirementDate: dateFromPatterns(normalized, [/fecha\s+(?:objetivo|estimada)\s+de\s+retiro[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
      withdrawalRestriction: /restricci[oó]n\s+de\s+retiro|retiro\s+anticipado|edad\s+de\s+retiro|65\s+a[nñ]os/.test(normalized),
      liquidityRestriction: /largo\s+plazo|no\s+liquido|sin\s+liquidez|restricci[oó]n\s+de\s+liquidez/.test(normalized),
      aforeName: firstMatch(normalized, [/\bafore\s+([a-z0-9\s.]{3,40}?)\s+siefore/, /\bafore\s+([a-z0-9\s.]{3,40})/]),
      siefore: firstMatch(normalized, [/\b(siefore\s+[a-z0-9\s-]{2,30})/]),
      subaccounts: [
        ...new Set(
          [
            /retiro,\s*cesant[ií]a\s+y\s*vejez|\brcv\b/.test(normalized) ? 'RCV' : '',
            /ahorro\s+voluntario/.test(normalized) ? 'Ahorro voluntario' : '',
            /vivienda/.test(normalized) ? 'Vivienda' : '',
            /aportaciones?\s+complementarias?/.test(normalized) ? 'Aportaciones complementarias' : '',
          ].filter(Boolean),
        ),
      ],
      weeksContributed: numberFromPatterns(normalized, [/semanas\s+cotizadas[^\d]*([\d,.]+)/]),
      nssSuffix: last4FromPatterns(normalized, [/\bnss[^\d]*(\d{4,11})/]),
      curpSuffix: firstMatch(text, [/\bCURP[^\w]*([A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/i]).slice(-4),
      longTermLiquidity: /\bafore\b|siefore|cuenta\s+individual|largo\s+plazo|retiro/.test(normalized),
      aforeDetected: /\bafore\b|siefore|subcuenta|ahorro\s+voluntario|rendimiento\s+neto/.test(normalized),
      detectedInstruments,
      instrumentCount: detectedInstruments.length || undefined,
    })
  }

  const savingsProduct = /cajita\s+turbo/.test(normalized)
    ? 'Cajita Turbo'
    : /ahorro\s+congelado/.test(normalized)
      ? 'Ahorro Congelado'
      : /cajitas?\s+nu|cajita/.test(normalized)
        ? 'Cajitas Nu'
        : /cuenta\s+nu|nu\s+mexico|sofipo|\bSFP\b/i.test(text)
          ? 'Cuenta Nu / SOFIPO'
          : /smart\s+cash/.test(normalized)
            ? 'Smart Cash'
            : undefined

  const statementMovementFacts = extractBankStatementMovementFacts(text)
  const speiFacts = extractSpeiFacts(text)
  const statementMovementDepositsTotal = finiteNumberFact(statementMovementFacts, 'statementMovementDepositsTotal')
  const statementMovementWithdrawalsTotal = finiteNumberFact(statementMovementFacts, 'statementMovementWithdrawalsTotal')

  return cleanFacts({
    ...common,
    openingBalance: moneyFromPatterns(normalized, [/saldo\s+(?:inicial|anterior)[^\d-]*(-?[\d,.]+)/]),
    closingBalance: moneyFromPatterns(normalized, [/saldo\s+(?:final|actual|al\s+cierre)[^\d-]*(-?[\d,.]+)/]),
    depositsTotal: moneyFromPatterns(normalized, [/(?:depositos|abonos|creditos)[^\d-]*(-?[\d,.]+)/]) ?? statementMovementDepositsTotal,
    withdrawalsTotal: moneyFromPatterns(normalized, [/(?:retiros|cargos|debitos)[^\d-]*(-?[\d,.]+)/]) ?? statementMovementWithdrawalsTotal,
    ...statementMovementFacts,
    ...speiFacts,
    periodYield: moneyFromPatterns(normalized, [/rendimiento\s+(?:del\s+periodo|generado|mensual|diario)[^\d-]*(-?[\d,.]+)/]),
    annualYieldPercent: percentFromPatterns(normalized, [/(?:tasa\s+de\s+rendimiento\s+anual\s+fija|gat|ganancia\s+anual\s+total|rendimiento\s+anual)[^\d-]*([\d,.]+)\s*%/]),
    nominalGatPercent: percentFromPatterns(normalized, [/gat\s+nominal[^\d-]*([\d,.]+)\s*%/]),
    realGatPercent: percentFromPatterns(normalized, [/gat\s+real[^\d-]*([\d,.]+)\s*%/]),
    yieldCalculationDate: dateFromPatterns(normalized, [/valores\s+calculados\s+el[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
    yieldValidUntil: dateFromPatterns(normalized, [/vigencia\s+al[^\d]*(\d{1,2}[-/\s][a-z0-9\s./-]+?\d{2,4})/]),
    frozenTermDays: numberFromPatterns(normalized, [/ahorro\s+congelado[^\d]*(7|28|90|180)\s+d[ií]as?/, /\b(7|28|90|180)\s+d[ií]as?[^\n]*(?:ahorro\s+congelado|tasa)/]),
    minimumAmount: moneyFromPatterns(normalized, [/monto\s+m[ií]nimo\s+(?:de\s+)?ahorro[^\d-]*(-?[\d,.]+)/]),
    monthlyDepositLimitUdis: numberFromPatterns(normalized, [/l[ií]mite\s+(?:de\s+)?dep[oó]sitos?\s+mensuales[^\d]*([\d,.]+)\s*udis/i, /([\d,.]+)\s*udis[^\n]{0,80}mensuales/i]),
    protectionLimitUdis: numberFromPatterns(normalized, [/fondo\s+de\s+protecci[oó]n[^\d]*([\d,.]+)\s*udis/i, /proteg\w+[^\d]*([\d,.]+)\s*udis/i]),
    savingsProduct,
    frozenSavingsDetected: /ahorro\s+congelado|plazo\s+(?:7|28|90|180)\s+d[ií]as/.test(normalized),
  })
}

function buildExtractionQuality(kind: DocumentKind, text: string, facts: ExtractedFacts, ocrConfidence?: number) {
  const expected = expectedFieldKeysForExtracted(kind, facts)
  const missingFields = expected.filter((field) => {
    const value = facts[field]
    return value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  })
  const textLength = text.replace(/\s+/g, ' ').trim().length
  const fieldScore = expected.length ? (expected.length - missingFields.length) / expected.length : 0.5
  const textScore = textLength >= 600 ? 1 : textLength >= 240 ? 0.75 : textLength >= 80 ? 0.45 : 0.1
  const ocrScore = ocrConfidence === undefined ? 1 : Math.max(0, Math.min(1, ocrConfidence))
  const reconciliationPenalty =
    kind === 'credit_card_statement' && facts.cardReconciliationStatus === 'mismatch'
      ? 0.25
      : kind === 'credit_card_statement' && facts.cardReconciliationStatus === 'insufficient'
        ? 0.05
        : 0
  const score = Number(Math.max(0, fieldScore * 0.55 + textScore * 0.3 + ocrScore * 0.15 - reconciliationPenalty).toFixed(2))
  return {
    qualityScore: score,
    textLength,
    detectedFields: expected.length - missingFields.length,
    expectedFields: expected.length,
    missingFields,
  }
}

function parseXmlText(text: string, fileName: string) {
  const validation = XMLValidator.validate(text)
  if (validation !== true) {
    const message = typeof validation === 'object' && 'err' in validation ? validation.err.msg : 'estructura no valida'
    throw new Error(`XML invalido: ${fileName}. ${message}`)
  }
  return xmlParser.parse(text) as XmlRecord
}

function isXmlRecord(value: unknown): value is XmlRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function findXmlRecords(root: unknown, localName: string): XmlRecord[] {
  if (Array.isArray(root)) return root.flatMap((item) => findXmlRecords(item, localName))
  if (!isXmlRecord(root)) return []

  const matches: XmlRecord[] = []
  for (const [key, value] of Object.entries(root)) {
    if (key === localName) {
      if (Array.isArray(value)) matches.push(...value.filter(isXmlRecord))
      else if (isXmlRecord(value)) matches.push(value)
    }
    matches.push(...findXmlRecords(value, localName))
  }
  return matches
}

function firstXmlRecord(root: unknown, localName: string) {
  return findXmlRecords(root, localName)[0] ?? null
}

function attr(node: XmlRecord | null, name: string) {
  const value = node?.[name]
  return value === undefined || value === null ? '' : String(value)
}

function suffix(value: string, length = 4) {
  const normalized = value.replace(/\s+/g, '')
  return normalized ? normalized.slice(-length) : ''
}

function payrollConceptDetails(records: XmlRecord[], kind: 'perception' | 'deduction' | 'other') {
  return records.map((record) => {
    const taxable = parseMoney(attr(record, 'ImporteGravado'))
    const exempt = parseMoney(attr(record, 'ImporteExento'))
    const amount = kind === 'perception' ? taxable + exempt || parseMoney(attr(record, 'Importe')) : parseMoney(attr(record, 'Importe'))
    return {
      type: attr(record, kind === 'perception' ? 'TipoPercepcion' : kind === 'deduction' ? 'TipoDeduccion' : 'TipoOtroPago'),
      key: attr(record, 'Clave'),
      concept: attr(record, 'Concepto') || 'Concepto nomina',
      amount,
      taxable,
      exempt,
    }
  })
}

function payrollConceptTotal(records: XmlRecord[], patterns: RegExp[], typeCodes: string[] = []) {
  return records.reduce((sum, record) => {
    const concept = normalizeForSearch(`${attr(record, 'Concepto')} ${attr(record, 'Clave')}`)
    const typeCode = attr(record, 'TipoDeduccion')
    if (!patterns.some((pattern) => pattern.test(concept)) && !typeCodes.includes(typeCode)) return sum
    return sum + parseMoney(attr(record, 'Importe'))
  }, 0)
}

function extractedValuePopulated(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value === 'boolean') return value
  return Boolean(value)
}

function payrollCompletenessScore(fields: unknown[]) {
  const populated = fields.filter(extractedValuePopulated).length
  return Number((populated / Math.max(1, fields.length)).toFixed(2))
}

function xmlTextHasCfdiSignal(text: string) {
  return /sat\.gob\.mx\/cfd\/(?:3|4)|<\s*cfdi:Comprobante\b|xmlns:cfdi\s*=|xmlns\s*=\s*["']http:\/\/www\.sat\.gob\.mx\/cfd\//i.test(text)
}

function xmlTextHasPayrollSignal(text: string) {
  return /sat\.gob\.mx\/nomina|<\s*nomina\d*:Nomina\b|xmlns:nomina/i.test(text)
}

function cfdiVersion(comprobante: XmlRecord | null) {
  return attr(comprobante, 'Version') || attr(comprobante, 'version')
}

function cfdiGuardWarnings(text: string, comprobante: XmlRecord | null) {
  const warnings: string[] = []
  const version = cfdiVersion(comprobante)
  if (!comprobante) warnings.push('No se encontro nodo Comprobante de CFDI.')
  if (!xmlTextHasCfdiSignal(text)) warnings.push('No se detecto namespace CFDI/SAT; XML tratado como no verificable.')
  if (version && !['3.3', '4.0'].includes(version)) warnings.push(`Version CFDI no soportada (${version}).`)
  if (!version) warnings.push('No se detecto version CFDI.')
  return warnings
}

function isVerifiableCfdi(text: string, comprobante: XmlRecord | null) {
  const version = cfdiVersion(comprobante)
  return Boolean(comprobante && xmlTextHasCfdiSignal(text) && ['3.3', '4.0'].includes(version))
}

function rejectedDocument(file: File, reason: string, kind: DocumentKind = 'unknown'): ImportedDocument {
  return {
    id: docId(file),
    fileName: file.name,
    fileType: isImageFile(file)
      ? 'image'
      : file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
        ? 'pdf'
        : file.type.includes('csv') || file.name.toLowerCase().endsWith('.csv')
          ? 'csv'
          : file.type.includes('xml') || file.name.toLowerCase().endsWith('.xml')
            ? 'xml'
            : 'csv',
    kind,
    importedAt: new Date().toISOString(),
    status: 'rejected',
    summary: 'No se pudo importar este archivo sin intervencion manual.',
    extractedRows: 0,
    confidence: 0,
    classificationReasons: ['error controlado por archivo'],
    extracted: {
      qualitySchemaVersion,
      error: reason,
    },
    warnings: [reason],
  }
}

function ocrTextPreview(text: string) {
  return sanitizeImportedText(text).slice(0, 240)
}

function extractReceiptFacts(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const totalMatch =
    text.match(/(?:total|importe|monto)[^\d$-]*\$?\s*(-?[\d,.]+)/i) ??
    [...text.matchAll(/\$?\s*(-?[\d,.]{2,})/g)].at(-1)
  const ivaMatch = text.match(/(?:iva|tax)[^\d$-]*\$?\s*(-?[\d,.]+)/i)
  const dateMatch =
    text.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)?.[0] ??
    text.match(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/)?.[0] ??
    ''
  const merchant =
    lines.find((line) => !/(fecha|date|total|iva|tax|\$|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i.test(line)) ??
    lines[0] ??
    'Recibo escaneado'

  return {
    merchant,
    date: normalizeDate(dateMatch),
    total: parseMoney(totalMatch?.[1]),
    iva: parseMoney(ivaMatch?.[1]),
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

async function prepareImageForOcr(image: File | string): Promise<File | string> {
  if (
    typeof image === 'string' ||
    typeof document === 'undefined' ||
    typeof createImageBitmap === 'undefined' ||
    typeof File === 'undefined'
  ) {
    return image
  }

  try {
    const bitmap = await createImageBitmap(image)
    const longestSide = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(3, Math.max(1.35, 2200 / Math.max(1, longestSide)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(bitmap.width * scale)
    canvas.height = Math.ceil(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return image

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const frame = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < frame.data.length; index += 4) {
      const luminance = (frame.data[index] ?? 0) * 0.299 + (frame.data[index + 1] ?? 0) * 0.587 + (frame.data[index + 2] ?? 0) * 0.114
      const boosted = luminance < 180 ? Math.max(0, luminance * 0.78) : Math.min(255, 255 - (255 - luminance) * 0.58)
      frame.data[index] = boosted
      frame.data[index + 1] = boosted
      frame.data[index + 2] = boosted
    }
    context.putImageData(frame, 0, 0)

    const blob = await canvasToBlob(canvas)
    return blob ? new File([blob], `${slug(image.name)}-ocr.png`, { type: 'image/png' }) : image
  } catch {
    return image
  }
}

async function recognizeImages(images: Array<File | string>): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  const chunks: string[] = []
  const confidences: number[] = []

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
    })
    for (const image of images) {
      const preparedImage = await prepareImageForOcr(image)
      const { data } = await worker.recognize(preparedImage)
      chunks.push(data.text ?? '')
      if (typeof data.confidence === 'number') confidences.push(data.confidence)
    }
  } finally {
    await worker.terminate()
  }

  const confidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length / 100 : 0
  return {
    text: chunks.join('\n').trim(),
    confidence: Number(confidence.toFixed(2)),
  }
}

async function ocrPdfPages(pdf: PDFDocumentProxy, pageLimit: number) {
  if (typeof document === 'undefined') return { text: '', confidence: 0 }
  const images: string[] = []

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) continue
    await page.render({ canvas, canvasContext, viewport }).promise
    images.push(canvas.toDataURL('image/png'))
  }

  return images.length ? recognizeImages(images) : { text: '', confidence: 0 }
}

function pdfTextPageFromContent(textContent: { items?: unknown[] }): PdfTextPage {
  const runs = (textContent.items ?? [])
    .map((item, index) => {
      if (!item || typeof item !== 'object' || !('str' in item)) return null
      const str = String((item as { str?: unknown }).str ?? '').trim()
      const transform = (item as { transform?: unknown }).transform
      if (!str || !Array.isArray(transform)) return null
      const x = Number(transform[4] ?? 0)
      const y = Number(transform[5] ?? 0)
      const width = Number((item as { width?: unknown }).width ?? 0)
      const height = Number((item as { height?: unknown }).height ?? 0)
      return { str, x, y, width, height, index }
    })
    .filter((item): item is { str: string; x: number; y: number; width: number; height: number; index: number } => Boolean(item))

  const plainText = runs
    .sort((a, b) => a.index - b.index)
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  const medianHeight = [...runs].map((item) => item.height).filter((value) => value > 0).sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? 8
  const tolerance = Math.max(3, medianHeight * 0.65)
  const lines: Array<{ y: number; runs: typeof runs }> = []
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= tolerance)
    if (line) {
      line.runs.push(run)
      line.y = (line.y * (line.runs.length - 1) + run.y) / line.runs.length
    } else {
      lines.push({ y: run.y, runs: [run] })
    }
  }

  const text = lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const sorted = [...line.runs].sort((a, b) => a.x - b.x)
      return sorted
        .reduce((lineText, run, index) => {
          if (index === 0) return run.str
          const previous = sorted[index - 1]
          if (!previous) return `${lineText} ${run.str}`
          const gap = run.x - (previous.x + previous.width)
          const separator = gap > 32 ? '    ' : gap > 12 ? '  ' : ' '
          return `${lineText}${separator}${run.str}`
        }, '')
        .replace(/\s+/g, ' ')
        .trim()
    })
    .filter(Boolean)
    .join('\n')
    .trim()

  return { text, plainText, itemCount: runs.length }
}

function shouldRunSupplementalPdfOcr(kind: DocumentKind, text: string, facts: ExtractedFacts) {
  if (typeof document === 'undefined' || text.length < 280) return text.length < 280
  if (kind === 'credit_card_statement') return !facts.cardMovementRowCount && text.length < 900
  if (kind === 'bank_statement') return !facts.statementMovementRowCount && text.length < 900
  if (kind === 'investment_statement') return !facts.positionRows && !facts.subaccountRows && text.length < 900
  if (kind === 'payroll_cfdi') return !facts.paymentDate || !facts.netIncome || !facts.periodStart || !facts.periodEnd
  return false
}

function inferCategory(description: string, amount: number) {
  const value = description.toLowerCase()
  if (amount > 0 && /nomina|n[oó]mina|salary|payroll/.test(value)) return 'Nomina'
  if (/uber|didi|gasolina|estacionamiento|metro|taxi/.test(value)) return 'Transporte'
  if (/super|mercado|costco|walmart|soriana|chedraui|city market/.test(value)) return 'Supermercado'
  if (/rest|cafe|coffee|bar|uber eats|rappi|didi food/.test(value)) return 'Restaurantes'
  if (/farmacia|hospital|doctor|salud|medic/.test(value)) return 'Salud'
  if (/netflix|spotify|apple|google|amazon|suscrip/.test(value)) return 'Suscripciones'
  if (/hotel|airbnb|aeromexico|volaris|viaje|travel/.test(value)) return 'Viajes'
  if (/comision|anualidad|interes|iva/.test(value)) return 'Comisiones e intereses'
  if (/factura|cfdi|ticket|recibo|compra/.test(value)) return 'Facturas y tickets'
  return amount >= 0 ? 'Ingreso por clasificar' : 'Sin categoria'
}

function classifyFinancialMovement(
  description: string,
  amount: number,
  accountType: Account['type'],
  preferredType?: Transaction['type'],
): { category: string; type: Transaction['type'] } {
  const value = normalizeForSearch(description)
  const salary = /nomina|salary|payroll|sueldo|salario|dispersion/.test(value)
  const cashWithdrawal = /retiro\s+(?:cajero|atm|efectivo|ventanilla)|disposici[oó]n\s+(?:cajero|efectivo)|cargo\s+en\s+cuenta/.test(value)
  const investment =
    /gbm|smart\s+cash|cetesdirecto|cetes|bonddia|enerfin|bondes|udibono|acciones?|etf|fondos?|ppr|\bafore\b|consar|siefore|subcuentas?|ahorro\s+(?:para\s+el\s+retiro|voluntario)|retiro,\s*cesant[ií]a\s+y\s*vejez|\brcv\b|inversion|aportaci[oó]n|compra\s+(?:de\s+)?t[ií]tulos/.test(
      value,
    )
  const investmentWithdrawal = /retiro\s+(?:de\s+)?(?:inversi[oó]n|ahorro\s+voluntario)|venta\s+(?:de\s+)?t[ií]tulos|liquidaci[oó]n|traspaso\s+desde\s+(?:gbm|afore)|disposici[oó]n\s+de\s+recursos/.test(value)
  const yieldLike = /rendimiento|inter[eé]s|dividendo|cup[oó]n|ganancia|gat/.test(value)
  const cardPayment = /pago\s+(?:tarjeta|tdc|amex|nu)|abono\s+(?:tarjeta|tdc)|payment\s+received|pago\s+recibido/.test(value)
  const transfer = /spei|traspaso|transferencia|clabe|entre\s+cuentas|retiro\s+cajita|cajita/.test(value)
  const refund = /devoluci[oó]n|reembolso|bonificaci[oó]n|ajuste|refund|cashback/.test(value)
  const fee = /comisi[oó]n|anualidad|inter[eé]s\s+moratorio|pago\s+tard[ií]o|iva\s+comisi[oó]n/.test(value)

  if (preferredType === 'debt_payment' || cardPayment) return { type: 'debt_payment', category: 'Pago de deuda' }
  if (salary && amount > 0 && !cashWithdrawal) return { type: 'income', category: 'Nomina' }
  if (yieldLike && amount > 0) return { type: 'income', category: investment ? 'Rendimientos de inversion' : 'Rendimientos e intereses' }
  if (investmentWithdrawal && amount > 0) return { type: 'transfer', category: 'Retiro de inversion' }
  if (accountType === 'investment' || accountType === 'retirement') return { type: 'transfer', category: amount >= 0 ? 'Movimiento patrimonial' : 'Aportacion a inversion' }
  if (investment) return { type: 'transfer', category: amount >= 0 ? 'Movimiento de inversion' : 'Aportacion a inversion' }
  if (transfer && accountType !== 'credit_card') return { type: 'transfer', category: 'Transferencias' }
  if (refund && amount > 0) return { type: 'transfer', category: 'Reembolsos y ajustes' }
  if (fee) return { type: 'expense', category: 'Comisiones e intereses' }
  if (preferredType === 'transfer') return { type: 'transfer', category: 'Creditos y ajustes' }
  if (preferredType) return { type: preferredType, category: inferCategory(description, amount) }
  return { type: amount >= 0 ? 'income' : 'expense', category: inferCategory(description, amount) }
}

function getOrCreateAccount(profile: FinancialProfile, account: Account) {
  const found = profile.accounts.find((row) => row.id === account.id)
  if (found) return { accountId: found.id, accounts: profile.accounts }
  return { accountId: account.id, accounts: [account, ...profile.accounts] }
}

interface TransactionMergeResult {
  transactions: Transaction[]
  addedTransactions: Transaction[]
  addedIds: string[]
  skippedDuplicateIds: string[]
  matchedTransactionIds: string[]
  skippedSemanticDuplicates: number
}

function isPayrollLikeTransaction(tx: Transaction) {
  const category = normalizeForSearch(tx.category)
  const merchant = normalizeForSearch(tx.merchant)
  return (
    tx.type === 'income' &&
    tx.amount > 0 &&
    (/nomina|salary|payroll|sueldo|salario/.test(category) || /nomina|salary|payroll|sueldo|salario/.test(merchant))
  )
}

function hasPayrollContext(value: string) {
  return /nomina|n[oó]mina|salary|payroll|sueldo|salario/.test(normalizeForSearch(value))
}

function payrollSemanticKey(tx: Transaction) {
  if (!isPayrollLikeTransaction(tx)) return ''
  return `payroll|${tx.date}|${Math.round(tx.amount * 100)}`
}

function dayNumber(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return Number.NaN
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
}

function dateDistanceDays(a: string, b: string) {
  const left = dayNumber(a)
  const right = dayNumber(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY
  return Math.abs(left - right)
}

function payrollSplitMatchIds(targetAmount: number, candidates: Transaction[]) {
  const amountTolerance = 1
  const sorted = candidates
    .filter((candidate) => candidate.amount < targetAmount)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)

  function findSubset(start: number, selected: Transaction[], sum: number): Transaction[] | null {
    if (selected.length >= 2 && Math.abs(sum - targetAmount) <= amountTolerance) return selected
    if (sum > targetAmount + amountTolerance || selected.length >= 4) return null
    for (let index = start; index < sorted.length; index += 1) {
      const candidate = sorted[index]
      if (!candidate) continue
      const match = findSubset(index + 1, [...selected, candidate], sum + candidate.amount)
      if (match) return match
    }
    return null
  }

  return findSubset(0, [], 0)?.map((candidate) => candidate.id) ?? []
}

function payrollToleranceMatchIds(tx: Transaction, candidates: Transaction[]) {
  if (!isPayrollLikeTransaction(tx)) return []
  const amountTolerance = 1
  const dateToleranceDays = 3
  const eligible = candidates.filter((candidate) => isPayrollLikeTransaction(candidate) && dateDistanceDays(tx.date, candidate.date) <= dateToleranceDays)
  const directMatch = eligible.find((candidate) => Math.abs(candidate.amount - tx.amount) <= amountTolerance)
  if (directMatch) return [directMatch.id]

  return payrollSplitMatchIds(tx.amount, eligible)
}

function incomingPayrollSplitMatches(transactions: Transaction[], candidates: Transaction[]) {
  const dateToleranceDays = 3
  const matches = new Map<string, string[]>()
  const incomingPayroll = transactions.filter(isPayrollLikeTransaction)
  for (const candidate of candidates) {
    const eligible = incomingPayroll.filter(
      (tx) => !matches.has(tx.id) && tx.amount < candidate.amount && dateDistanceDays(tx.date, candidate.date) <= dateToleranceDays,
    )
    const splitIds = payrollSplitMatchIds(candidate.amount, eligible)
    for (const id of splitIds) matches.set(id, [candidate.id])
  }
  return matches
}

function mergeTransactions(profile: FinancialProfile, transactions: Transaction[]): TransactionMergeResult {
  const existingIds = new Set(profile.transactions.map((tx) => tx.id))
  const existingFingerprints = new Map<string, string>()
  const existingSemanticFingerprints = new Map<string, string>()
  const payrollToleranceCandidates = [...profile.transactions].filter(isPayrollLikeTransaction)
  const incomingSplitMatches = incomingPayrollSplitMatches(transactions, payrollToleranceCandidates)
  for (const tx of profile.transactions) {
    existingFingerprints.set(`${tx.date}|${tx.amount}|${tx.merchant}|${tx.accountId}`, tx.id)
    const semanticKey = payrollSemanticKey(tx)
    if (semanticKey) existingSemanticFingerprints.set(semanticKey, tx.id)
  }
  const skippedDuplicateIds: string[] = []
  const matchedTransactionIds: string[] = []
  let skippedSemanticDuplicates = 0
  const addedTransactions = transactions.filter((tx) => {
    const fingerprint = `${tx.date}|${tx.amount}|${tx.merchant}|${tx.accountId}`
    const exactMatchId = existingFingerprints.get(fingerprint)
    if (existingIds.has(tx.id) || exactMatchId) {
      skippedDuplicateIds.push(tx.id)
      if (exactMatchId) matchedTransactionIds.push(exactMatchId)
      return false
    }
    const semanticFingerprint = payrollSemanticKey(tx)
    const semanticMatchIds = semanticFingerprint
      ? incomingSplitMatches.get(tx.id) ??
        (existingSemanticFingerprints.get(semanticFingerprint)
          ? [existingSemanticFingerprints.get(semanticFingerprint) as string]
          : payrollToleranceMatchIds(tx, payrollToleranceCandidates))
      : []
    if (semanticMatchIds.length) {
      skippedDuplicateIds.push(tx.id)
      matchedTransactionIds.push(...semanticMatchIds)
      skippedSemanticDuplicates += 1
      return false
    }
    existingIds.add(tx.id)
    existingFingerprints.set(fingerprint, tx.id)
    if (semanticFingerprint) existingSemanticFingerprints.set(semanticFingerprint, tx.id)
    return true
  })
  return {
    transactions: [...addedTransactions, ...profile.transactions],
    addedTransactions,
    addedIds: addedTransactions.map((tx) => tx.id),
    skippedDuplicateIds,
    matchedTransactionIds,
    skippedSemanticDuplicates,
  }
}

function csvHasAmexActivitySchema(fields: string[]) {
  const fieldSet = new Set(fields.map(normalizeHeader))
  return (
    fieldSet.has('fecha') &&
    fieldSet.has('fecha_de_compra') &&
    fieldSet.has('importe') &&
    fieldSet.has('titular_de_la_tarjeta') &&
    fieldSet.has('cuenta') &&
    fieldSet.has('aparece_en_su_estado_de_cuenta_como')
  )
}

function csvHasBankMovementSchema(fields: string[]) {
  const fieldSet = new Set(fields.map(normalizeHeader))
  const hasNature = fieldSet.has('tipo') || fieldSet.has('tipo_movimiento') || fieldSet.has('tipo_de_movimiento') || fieldSet.has('naturaleza')
  const hasAmount = fieldSet.has('monto') || fieldSet.has('importe') || fieldSet.has('amount')
  return (
    fieldSet.has('deposito') ||
    fieldSet.has('depositos') ||
    fieldSet.has('abono') ||
    fieldSet.has('abonos') ||
    fieldSet.has('cargo') ||
    fieldSet.has('cargos') ||
    fieldSet.has('credit') ||
    fieldSet.has('debit') ||
    fieldSet.has('retiro') ||
    fieldSet.has('retiros') ||
    (hasNature && hasAmount) ||
    fieldSet.has('saldo') ||
    fieldSet.has('saldo_final')
  )
}

function csvHasInvestmentOperationSchema(fields: string[]) {
  const fieldSet = new Set(fields.map(normalizeHeader))
  const hasTradeDate =
    fieldSet.has('fecha_operacion') ||
    fieldSet.has('fecha_de_operacion') ||
    fieldSet.has('trade_date') ||
    fieldSet.has('operation_date') ||
    fieldSet.has('fecha')
  const hasInstrument =
    fieldSet.has('ticker') ||
    fieldSet.has('emisora') ||
    fieldSet.has('simbolo') ||
    fieldSet.has('symbol') ||
    fieldSet.has('instrumento')
  const hasQuantity = fieldSet.has('titulos') || fieldSet.has('títulos') || fieldSet.has('cantidad') || fieldSet.has('quantity')
  const hasPrice = fieldSet.has('precio') || fieldSet.has('price') || fieldSet.has('precio_promedio') || fieldSet.has('precio_de_operacion')
  const hasTradeAmount = fieldSet.has('importe') || fieldSet.has('monto') || fieldSet.has('amount') || fieldSet.has('valor_operacion')
  return hasTradeDate && hasInstrument && (hasQuantity || hasPrice || hasTradeAmount)
}

function csvHasRetirementSubaccountSchema(fields: string[]) {
  const fieldSet = new Set(fields.map(normalizeHeader))
  const hasSubaccount = fieldSet.has('subcuenta') || fieldSet.has('subcuenta_afore') || fieldSet.has('cuenta_individual')
  const hasBalance = fieldSet.has('saldo') || fieldSet.has('saldo_subcuenta') || fieldSet.has('saldo_final') || fieldSet.has('balance')
  const hasRetirementSignal =
    fieldSet.has('siefore') ||
    fieldSet.has('semanas_cotizadas') ||
    fieldSet.has('producto_retiro') ||
    fieldSet.has('aportaciones') ||
    fieldSet.has('retiros') ||
    fieldSet.has('rendimiento')
  return hasSubaccount && hasBalance && hasRetirementSignal
}

const csvChargeFields = ['Cargo', 'Cargos', 'Charge', 'Debit', 'Retiro', 'Retiros']
const csvCreditFields = ['Abono', 'Abonos', 'Credit', 'Payment', 'Pago', 'Deposito', 'Depósito', 'Depositos', 'Depósitos']
const csvNatureFields = ['Tipo', 'Tipo movimiento', 'Tipo de movimiento', 'Naturaleza', 'Cargo/Abono', 'Cargo Abono', 'Débito/Crédito', 'Debito Credito']

function investmentOperationSide(value: string): 'buy' | 'sell' | 'income' | 'fee' | 'transfer' | '' {
  const normalized = normalizeForSearch(value)
  if (/compra|buy|cargo|aportaci[oó]n|fondeo|deposito|dep[oó]sito/.test(normalized)) return 'buy'
  if (/venta|sell|liquidaci[oó]n|retiro|withdrawal/.test(normalized)) return 'sell'
  if (/dividendo|inter[eé]s|rendimiento|cup[oó]n|distribuci[oó]n/.test(normalized)) return 'income'
  if (/comisi[oó]n|fee|arancel|impuesto|retenci[oó]n|isr/.test(normalized)) return 'fee'
  if (/traspaso|transferencia|transfer/.test(normalized)) return 'transfer'
  return ''
}

function csvInvestmentOperationRows(rows: Array<Record<string, string>>) {
  const parsedRows = rows
    .slice(0, 1000)
    .map((row) => {
      const tradeDate = normalizeDate(getRowValue(row, ['Fecha operacion', 'Fecha de operacion', 'Trade Date', 'Operation Date', 'Fecha']))
      const settlementDate = normalizeDate(getRowValue(row, ['Fecha liquidacion', 'Fecha de liquidacion', 'Settlement Date', 'Fecha valor']))
      const rawOperation = getRowValue(row, ['Operacion', 'Operación', 'Tipo', 'Movimiento', 'Side', 'Concepto'])
      const ticker = sanitizeImportedText(getRowValue(row, ['Ticker', 'Emisora', 'Simbolo', 'Símbolo', 'Symbol', 'Instrumento'])).toUpperCase()
      const instrumentType = sanitizeImportedText(getRowValue(row, ['Tipo instrumento', 'Tipo de instrumento', 'Instrumento', 'Asset Class']))
      const market = sanitizeImportedText(getRowValue(row, ['Mercado', 'Market', 'Bolsa'])).toUpperCase()
      const currency = sanitizeImportedText(getRowValue(row, ['Moneda', 'Currency', 'Divisa'])).toUpperCase()
      const quantity = numberFromPatterns(getRowValue(row, ['Titulos', 'Títulos', 'Cantidad', 'Quantity', 'Unidades']), [/(-?[\d,.]+)/])
      const price = moneyFromPatterns(getRowValue(row, ['Precio', 'Price', 'Precio promedio', 'Precio de operacion']), [/(-?[\d,.]+)/])
      const grossAmount = Math.abs(parseMoney(getRowValue(row, ['Importe', 'Monto', 'Amount', 'Valor operacion', 'Valor de operacion'])))
      const commission = Math.abs(parseMoney(getRowValue(row, ['Comision', 'Comisión', 'Commission', 'Arancel'])))
      const taxWithheld = Math.abs(parseMoney(getRowValue(row, ['Impuesto', 'ISR', 'Retencion', 'Retención', 'Tax'])))
      const side = investmentOperationSide(`${rawOperation} ${ticker}`)
      const cashFlow =
        side === 'buy'
          ? -Math.abs(grossAmount + commission + taxWithheld)
          : side === 'sell'
            ? Math.abs(grossAmount - commission - taxWithheld)
            : side === 'income'
              ? Math.abs(grossAmount - taxWithheld)
              : side === 'fee'
                ? -Math.abs(grossAmount + commission + taxWithheld)
                : 0
      if (!tradeDate || !ticker || (!quantity && !price && !grossAmount)) return null
      return cleanPositionFact({
        tradeDate,
        settlementDate,
        operationType: side || sanitizeImportedText(rawOperation),
        ticker,
        instrumentType: instrumentType || undefined,
        market: market || undefined,
        currency: currency || undefined,
        quantity,
        price,
        grossAmount: grossAmount || undefined,
        commission: commission || undefined,
        taxWithheld: taxWithheld || undefined,
        cashFlow: cashFlow || undefined,
      })
    })
    .filter((row): row is PositionFact => Boolean(row))

  const buyRows = parsedRows.filter((row) => row.operationType === 'buy').length
  const sellRows = parsedRows.filter((row) => row.operationType === 'sell').length
  const incomeRows = parsedRows.filter((row) => row.operationType === 'income').length
  const feeRows = parsedRows.filter((row) => row.operationType === 'fee').length
  const tradedAmount = parsedRows.reduce((sum, row) => sum + (typeof row.grossAmount === 'number' ? row.grossAmount : 0), 0)
  const commissionsAmount = parsedRows.reduce((sum, row) => sum + (typeof row.commission === 'number' ? row.commission : 0), 0)
  const taxWithheld = parsedRows.reduce((sum, row) => sum + (typeof row.taxWithheld === 'number' ? row.taxWithheld : 0), 0)
  const cashFlowTotal = parsedRows.reduce((sum, row) => sum + (typeof row.cashFlow === 'number' ? row.cashFlow : 0), 0)
  const tickers = [...new Set(parsedRows.map((row) => (typeof row.ticker === 'string' ? row.ticker : '')).filter(Boolean))].slice(0, 20)
  const markets = [...new Set(parsedRows.map((row) => (typeof row.market === 'string' ? row.market : '')).filter(Boolean))].slice(0, 8)
  const currencies = [...new Set(parsedRows.map((row) => (typeof row.currency === 'string' ? row.currency : '')).filter(Boolean))].slice(0, 4)

  return cleanFacts({
    investmentOperationRows: parsedRows,
    investmentOperationRowCount: parsedRows.length || undefined,
    investmentBuyRows: buyRows || undefined,
    investmentSellRows: sellRows || undefined,
    investmentIncomeRows: incomeRows || undefined,
    investmentFeeRows: feeRows || undefined,
    tradedAmount: parsedRows.length ? Number(tradedAmount.toFixed(2)) : undefined,
    commissionsAmount: commissionsAmount ? Number(commissionsAmount.toFixed(2)) : undefined,
    taxWithheld: taxWithheld ? Number(taxWithheld.toFixed(2)) : undefined,
    investmentCashFlow: parsedRows.length ? Number(cashFlowTotal.toFixed(2)) : undefined,
    tickers,
    markets,
    currencies,
  })
}

function csvRetirementSubaccountFacts(rows: Array<Record<string, string>>, sourceText: string) {
  const parsedRows = rows
    .slice(0, 500)
    .map((row) => {
      const name = sanitizeImportedText(getRowValue(row, ['Subcuenta', 'Subcuenta afore', 'Cuenta individual']))
      const balance = parseMoney(getRowValue(row, ['Saldo', 'Saldo subcuenta', 'Saldo final', 'Balance']))
      const contributions = parseMoney(getRowValue(row, ['Aportaciones', 'Aportaciones periodo', 'Depositos', 'Depósitos']))
      const withdrawals = parseMoney(getRowValue(row, ['Retiros', 'Retiro', 'Disposiciones']))
      const periodReturn = parseMoney(getRowValue(row, ['Rendimiento', 'Rendimiento periodo', 'Ganancia']))
      if (!name || !balance) return null
      return cleanPositionFact({
        name,
        balance,
        contributions: contributions || undefined,
        withdrawals: withdrawals || undefined,
        periodReturn: periodReturn || undefined,
      })
    })
    .filter((row): row is PositionFact => Boolean(row))

  const subaccountBalanceTotal = parsedRows.reduce((sum, row) => sum + (typeof row.balance === 'number' ? row.balance : 0), 0)
  const voluntaryContributions = parsedRows.reduce(
    (sum, row) => (/voluntario/i.test(String(row.name)) && typeof row.contributions === 'number' ? sum + row.contributions : sum),
    0,
  )
  const mandatoryContributions = parsedRows.reduce(
    (sum, row) => (/retiro|cesantia|vejez|\brcv\b/i.test(String(row.name)) && typeof row.contributions === 'number' ? sum + row.contributions : sum),
    0,
  )
  const retirementWithdrawals = parsedRows.reduce((sum, row) => sum + (typeof row.withdrawals === 'number' ? row.withdrawals : 0), 0)
  const periodReturn = parsedRows.reduce((sum, row) => sum + (typeof row.periodReturn === 'number' ? row.periodReturn : 0), 0)
  const normalized = normalizeForSearch(sourceText)
  const detectedSubaccounts = [
    ...new Set(
      parsedRows
        .map((row) => String(row.name ?? ''))
        .map((name) => {
          const value = normalizeForSearch(name)
          if (/retiro|cesantia|vejez|\brcv\b/.test(value)) return 'RCV'
          if (/voluntario/.test(value)) return 'Ahorro voluntario'
          if (/vivienda|infonavit/.test(value)) return 'Vivienda'
          return name
        })
        .filter(Boolean),
    ),
  ].slice(0, 12)

  return cleanFacts({
    retirementProduct: /ppr|plan personal/i.test(sourceText) ? 'PPR' : 'AFORE',
    investmentProduct: /ppr|plan personal/i.test(sourceText) ? 'PPR' : 'AFORE',
    subaccountPositions: parsedRows,
    subaccountRows: parsedRows.length || undefined,
    subaccountBalanceTotal: parsedRows.length ? Number(subaccountBalanceTotal.toFixed(2)) : undefined,
    retirementBalance: parsedRows.length ? Number(subaccountBalanceTotal.toFixed(2)) : undefined,
    voluntaryContributions: voluntaryContributions ? Number(voluntaryContributions.toFixed(2)) : undefined,
    mandatoryContributions: mandatoryContributions ? Number(mandatoryContributions.toFixed(2)) : undefined,
    retirementWithdrawals: retirementWithdrawals ? Number(retirementWithdrawals.toFixed(2)) : undefined,
    periodReturn: periodReturn ? Number(periodReturn.toFixed(2)) : undefined,
    siefore: sanitizeImportedText(getRowValue(rows[0] ?? {}, ['SIEFORE', 'Siefore'])) || undefined,
    weeksContributed: numberFromPatterns(getRowValue(rows[0] ?? {}, ['Semanas cotizadas', 'Semanas']), [/([\d,.]+)/]),
    subaccounts: detectedSubaccounts,
    longTermLiquidity: true,
    withdrawalRestriction: /restriccion|retiro|largo plazo|65 anos|65 años/.test(normalized) || undefined,
    aforeDetected: /afore|siefore|consar|cuenta individual/.test(normalized) || undefined,
  })
}

function csvSavingsStatementFacts(rows: Array<Record<string, string>>, sourceText: string) {
  const firstProduct = rows.map((row) => getRowValue(row, ['Producto', 'Producto ahorro', 'Cajita', 'Cuenta'])).find(Boolean)
  const firstVigency = rows.map((row) => getRowValue(row, ['Vigencia', 'Vigencia al', 'Valid until'])).find(Boolean)
  const nominalGat = rows.map((row) => percentFromPatterns(getRowValue(row, ['GAT Nominal', 'GAT nominal', 'Ganancia Anual Total nominal']), [/([\d,.]+)/])).find((value) => value !== undefined)
  const realGat = rows.map((row) => percentFromPatterns(getRowValue(row, ['GAT Real', 'GAT real', 'Ganancia Anual Total real']), [/([\d,.]+)/])).find((value) => value !== undefined)
  const protectionLimitUdis = rows.map((row) => numberFromPatterns(getRowValue(row, ['Proteccion UDIs', 'Protección UDIs', 'Fondo proteccion']), [/([\d,.]+)/])).find((value) => value !== undefined)
  const normalized = normalizeForSearch(`${sourceText} ${firstProduct}`)
  if (!firstProduct && nominalGat === undefined && realGat === undefined && protectionLimitUdis === undefined) return {}

  return cleanFacts({
    savingsProduct: /cajita turbo/.test(normalized)
      ? 'Cajita Turbo'
      : /cajita/.test(normalized)
        ? 'Cajitas Nu'
        : /cuenta nu|sofipo/.test(normalized)
          ? 'Cuenta Nu / SOFIPO'
          : sanitizeImportedText(firstProduct ?? ''),
    nominalGatPercent: nominalGat,
    realGatPercent: realGat,
    yieldValidUntil: firstVigency ? normalizeDate(firstVigency) : undefined,
    protectionLimitUdis,
    frozenSavingsDetected: /cajita|ahorro congelado/.test(normalized) || undefined,
  })
}

function csvMovementDirection(row: Record<string, string>, description: string): 'deposit' | 'withdrawal' | '' {
  const nature = normalizeForSearch(getRowValue(row, csvNatureFields))
  if (/dep[oó]sito|deposito|abono|credito|cr[eé]dito|entrada|ingreso/.test(nature)) return 'deposit'
  if (/retiro|cargo|debito|d[eé]bito|salida|egreso/.test(nature)) return 'withdrawal'

  const value = normalizeForSearch(description)
  if (/pago\s+(?:tarjeta|tdc|amex|nu)|spei\s+(?:enviado|salida)|transferencia\s+(?:enviada|a\s+terceros)|traspaso\s+a\s+|retiro\s+(?:cajero|atm|efectivo|ventanilla)|disposici[oó]n\s+(?:cajero|efectivo)/.test(value)) {
    return 'withdrawal'
  }
  if (/dep[oó]sito|abono|spei\s+recibido|transferencia\s+recibida/.test(value)) return 'deposit'
  return ''
}

function csvAmountForRow(row: Record<string, string>, accountType: Account['type'], isAmexActivitySchema: boolean, description: string) {
  const normalizedDescription = normalizeForSearch(description)
  const isPayment = /pago|abono|payment|recibido|received/.test(normalizedDescription)
  const isCreditLike = isPayment || /devoluci[oó]n|reembolso|bonificaci[oó]n|ajuste|credito|credit|refund/.test(normalizedDescription)
  const chargeRaw = getRowValue(row, csvChargeFields)
  const creditRaw = getRowValue(row, csvCreditFields)
  const signedRaw = getRowValue(row, ['Importe', 'Amount', 'Monto'])

  if (chargeRaw) {
    const value = parseMoney(chargeRaw)
    return value ? { amount: -Math.abs(value), type: 'expense' as const, source: 'charge' } : null
  }

  if (creditRaw) {
    const value = parseMoney(creditRaw)
    if (!value) return null
    return {
      amount: Math.abs(value),
      type: accountType === 'credit_card' && isPayment ? ('debt_payment' as const) : accountType === 'credit_card' ? ('transfer' as const) : ('income' as const),
      source: 'credit',
    }
  }

  if (!signedRaw) return null
  const value = parseMoney(signedRaw)
  if (!value) return null

  if (accountType !== 'credit_card') {
    const direction = csvMovementDirection(row, description)
    if (direction === 'withdrawal') return { amount: -Math.abs(value), type: 'expense' as const, source: 'signed_withdrawal_context' }
    if (direction === 'deposit') return { amount: Math.abs(value), type: 'income' as const, source: 'signed_deposit_context' }
    return { amount: value, type: value >= 0 ? ('income' as const) : ('expense' as const), source: 'signed' }
  }

  if (isAmexActivitySchema) {
    if (value < 0) {
      return {
        amount: Math.abs(value),
        type: isPayment ? ('debt_payment' as const) : isCreditLike ? ('transfer' as const) : ('transfer' as const),
        source: 'amex_signed_credit',
      }
    }
    return { amount: -Math.abs(value), type: 'expense' as const, source: 'amex_signed_charge' }
  }

  return {
    amount: isPayment ? Math.abs(value) : -Math.abs(value),
    type: isPayment ? ('debt_payment' as const) : ('expense' as const),
    source: 'signed_credit_card_default',
  }
}

function inferBankAmountFromBalanceDelta(amount: number, previousBalance: number | undefined, rowBalance: number | undefined) {
  if (!amount || previousBalance === undefined || rowBalance === undefined) return null
  const absoluteAmount = Math.abs(amount)
  const delta = Number((rowBalance - previousBalance).toFixed(2))
  if (Math.abs(delta - absoluteAmount) <= 0.01) {
    return { amount: absoluteAmount, type: 'transfer' as const, source: 'balance_delta_deposit' }
  }
  if (Math.abs(delta + absoluteAmount) <= 0.01) {
    return { amount: -absoluteAmount, type: 'expense' as const, source: 'balance_delta_withdrawal' }
  }
  return null
}

function upsertCreditCardDebt(
  profile: FinancialProfile,
  accountId: string,
  name: string,
  balance: number,
  details: { balanceIsDebt?: boolean; creditLimit?: number; minimumPayment?: number; dueDate?: string } = {},
) {
  const debtBalance = details.balanceIsDebt ? Math.abs(balance) : Math.abs(Math.min(0, balance))
  if (!debtBalance) return profile.debts
  const existing = profile.debts.find((debt) => debt.id === `debt-${accountId}`)
  if (existing) {
    return profile.debts.map((debt) =>
      debt.id === existing.id
        ? {
            ...debt,
            balance: debtBalance,
            creditLimit: details.creditLimit ?? debt.creditLimit,
            minimumPayment: details.minimumPayment ?? debt.minimumPayment,
            dueDate: details.dueDate ?? debt.dueDate,
          }
        : debt,
    )
  }
  return [
    {
      id: `debt-${accountId}`,
      name,
      balance: debtBalance,
      apr: 0,
      minimumPayment: details.minimumPayment ?? 0,
      creditLimit: details.creditLimit,
      dueDate: details.dueDate ?? new Date().toISOString().slice(0, 10),
    },
    ...profile.debts,
  ]
}

function buildTransaction(input: ParsedTransactionInput, file: File, index: number): Transaction {
  const type = input.type ?? (input.amount >= 0 ? 'income' : 'expense')
  return {
    id: transactionId(file, index, input.date, input.amount),
    date: input.date,
    amount: input.amount,
    merchant: input.merchant || 'Movimiento importado',
    category: input.category,
    accountId: input.accountId,
    type,
    isEssential: essentialCategories.has(input.category),
  }
}

function deriveMonthlySnapshots(profile: FinancialProfile): FinancialProfile {
  const byMonth = new Map<string, { income: number; expenses: number; debtPayments: number }>()
  for (const tx of profile.transactions) {
    const month = tx.date.slice(0, 7)
    const current = byMonth.get(month) ?? { income: 0, expenses: 0, debtPayments: 0 }
    if (tx.type === 'debt_payment') current.debtPayments += Math.abs(tx.amount)
    else if (tx.type === 'income') current.income += Math.max(0, tx.amount)
    else if (tx.type === 'expense') current.expenses += Math.abs(tx.amount)
    byMonth.set(month, current)
  }

  const accountAssets = profile.accounts
    .filter((account) => !['credit_card', 'loan'].includes(account.type))
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
  const accountLiabilities = profile.accounts
    .filter((account) => ['credit_card', 'loan'].includes(account.type))
    .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
  const debtLiabilities = profile.debts.reduce((sum, debt) => sum + debt.balance, 0)
  const netWorth = accountAssets - accountLiabilities - debtLiabilities

  const snapshots = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      income: values.income,
      expenses: values.expenses,
      debtPayments: values.debtPayments,
      savings: Math.max(0, values.income - values.expenses - values.debtPayments),
      netWorth,
    }))

  const avgIncome =
    snapshots.reduce((sum, snapshot) => sum + snapshot.income, 0) / Math.max(1, snapshots.filter((row) => row.income > 0).length)

  return {
    ...profile,
    grossMonthlyIncome: Math.max(profile.grossMonthlyIncome, avgIncome),
    netMonthlyIncome: Math.max(profile.netMonthlyIncome, avgIncome),
    monthlySnapshots: snapshots.length ? snapshots : profile.monthlySnapshots,
  }
}

function mergeDocument(profile: FinancialProfile, document: ImportedDocument) {
  const existingByFingerprint = document.documentFingerprint
    ? profile.importedDocuments.find((row) => row.documentFingerprint === document.documentFingerprint)
    : undefined
  if (existingByFingerprint) {
    const nextDocument = {
      ...document,
      id: existingByFingerprint.id,
      warnings: [
        ...(document.warnings ?? []),
        'Documento reimportado con contenido ya conocido; se conserva el identificador anterior para evitar duplicados.',
      ],
    }
    return profile.importedDocuments.map((row) => (row.id === existingByFingerprint.id ? nextDocument : row))
  }

  const hasIdCollision = profile.importedDocuments.some((row) => row.id === document.id)
  if (!hasIdCollision) return [document, ...profile.importedDocuments]
  const fingerprintSuffix = document.documentFingerprint?.split(':').at(-1)?.slice(0, 10) ?? 'nuevo'
  return [{ ...document, id: `${document.id}-${fingerprintSuffix}` }, ...profile.importedDocuments]
}

function canonicalImportedDocument(profile: FinancialProfile, document: ImportedDocument) {
  return (
    (document.documentFingerprint
      ? profile.importedDocuments.find((row) => row.documentFingerprint === document.documentFingerprint)
      : undefined) ?? profile.importedDocuments.find((row) => row.id === document.id) ?? document
  )
}

function documentExtractedNumber(document: ImportedDocument, key: string) {
  const value = document.extracted?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function documentExtractedString(document: ImportedDocument, key: string) {
  const value = document.extracted?.[key]
  return typeof value === 'string' ? value : ''
}

function statementMovementRows(document: ImportedDocument): PositionFact[] {
  const rows = document.extracted?.statementMovementRows
  if (!Array.isArray(rows)) return []
  return rows.filter((row): row is PositionFact => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
}

function cardMovementRows(document: ImportedDocument): PositionFact[] {
  const rows = document.extracted?.cardMovementRows
  if (!Array.isArray(rows)) return []
  return rows.filter((row): row is PositionFact => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
}

function reviewedStatementAccountType(document: ImportedDocument): Account['type'] {
  const accountType = documentExtractedString(document, 'accountType')
  return ['checking', 'savings', 'investment', 'retirement', 'credit_card', 'loan'].includes(accountType) ? (accountType as Account['type']) : 'checking'
}

function transactionFromStatementMovement(document: ImportedDocument, accountId: string, accountType: Account['type'], row: PositionFact, index: number): Transaction | null {
  const date = typeof row.date === 'string' ? normalizeDate(row.date) : ''
  const description = typeof row.description === 'string' ? sanitizeImportedText(row.description) : ''
  const deposit = typeof row.deposit === 'number' ? Math.abs(row.deposit) : 0
  const withdrawal = typeof row.withdrawal === 'number' ? Math.abs(row.withdrawal) : 0
  const amount = deposit > 0 ? deposit : withdrawal > 0 ? -withdrawal : typeof row.amount === 'number' ? row.amount : 0
  if (!date || !description || !amount) return null
  const movement = classifyFinancialMovement(description, amount, accountType, amount >= 0 ? 'income' : 'expense')
  return {
    id: `tx-reviewed-${document.id}-${index}-${date}-${Math.round(amount * 100)}`,
    date,
    amount,
    merchant: description,
    category: movement.category,
    accountId,
    type: movement.type,
    isEssential: essentialCategories.has(movement.category),
  }
}

function transactionFromCardMovement(document: ImportedDocument, accountId: string, row: PositionFact, index: number): Transaction | null {
  const date = typeof row.date === 'string' ? normalizeDate(row.date) : ''
  const description = typeof row.description === 'string' ? sanitizeImportedText(row.description) : ''
  const charge = typeof row.charge === 'number' ? Math.abs(row.charge) : 0
  const payment = typeof row.payment === 'number' ? Math.abs(row.payment) : 0
  const credit = typeof row.credit === 'number' ? Math.abs(row.credit) : 0
  const populatedAmounts = [charge, payment, credit].filter((value) => value > 0).length
  if (!date || !description || populatedAmounts !== 1) return null
  const amount = charge > 0 ? -charge : payment > 0 ? payment : credit
  const preferredType: Transaction['type'] = charge > 0 ? 'expense' : payment > 0 ? 'debt_payment' : 'transfer'
  const movement = classifyFinancialMovement(description, amount, 'credit_card', preferredType)
  return {
    id: `tx-reviewed-card-${document.id}-${index}-${date}-${Math.round(amount * 100)}`,
    date,
    amount,
    merchant: description,
    category: movement.category,
    accountId,
    type: movement.type,
    isEssential: essentialCategories.has(movement.category),
  }
}

function transactionFromPayrollPdf(document: ImportedDocument, accountId: string): Transaction | null {
  const date = normalizeDate(documentExtractedString(document, 'paymentDate'))
  const amount = documentExtractedNumber(document, 'netIncome')
  if (!date || amount <= 0) return null
  return {
    id: `tx-reviewed-payroll-${document.id}-${date}-${Math.round(amount * 100)}`,
    date,
    amount,
    merchant: document.detectedInstitution ? `Nomina ${document.detectedInstitution}` : 'Nomina importada',
    category: 'Nomina',
    accountId,
    type: 'income',
    isEssential: false,
  }
}

export function applyReviewedStatementMovements(profile: FinancialProfile, documentId: string): ApplyReviewedMovementsResult {
  const document = profile.importedDocuments.find((row) => row.id === documentId)
  if (!document) throw new Error('No se encontro el documento para aplicar movimientos.')
  if (!['bank_statement', 'credit_card_statement', 'payroll_cfdi'].includes(document.kind ?? 'unknown')) {
    throw new Error('Solo se pueden aplicar estados bancarios, tarjetas conciliadas o nominas con fecha e ingreso neto detectados.')
  }
  if (document.extracted?.reviewedMovementRowsAppliedAt) throw new Error('Este documento ya tenia movimientos revisados aplicados.')
  const isCreditCardStatement = document.kind === 'credit_card_statement'
  const isPayrollPdf = document.kind === 'payroll_cfdi'
  if (isCreditCardStatement && document.extracted?.cardReconciliationStatus !== 'balanced') {
    throw new Error('Solo se pueden aplicar movimientos de tarjeta cuando la conciliacion de saldos esta balanceada.')
  }
  const rows = isCreditCardStatement ? cardMovementRows(document) : statementMovementRows(document)
  if (!isPayrollPdf && !rows.length) throw new Error('El documento no tiene movimientos visibles para aplicar.')

  const accountType = isCreditCardStatement ? 'credit_card' : isPayrollPdf ? 'checking' : reviewedStatementAccountType(document)
  const institution = document.detectedInstitution ?? document.fileName
  const accountId = documentExtractedString(document, 'accountId') || `account-${slug(institution)}-${accountType}`
  const { accounts } = getOrCreateAccount(profile, {
    id: accountId,
    name: isPayrollPdf ? 'Cuenta nomina importada' : document.detectedInstitution ? `${document.detectedInstitution} cuenta` : `Cuenta ${document.fileName}`,
    type: accountType,
    balance: 0,
    currency: 'MXN',
    creditLimit: isCreditCardStatement ? documentExtractedNumber(document, 'creditLimit') || undefined : undefined,
  })
  const transactions = isPayrollPdf
    ? [transactionFromPayrollPdf(document, accountId)].filter((tx): tx is Transaction => Boolean(tx))
    : rows
        .map((row, index) =>
          isCreditCardStatement
            ? transactionFromCardMovement(document, accountId, row, index)
            : transactionFromStatementMovement(document, accountId, accountType, row, index),
        )
        .filter((tx): tx is Transaction => Boolean(tx))
  if (!transactions.length) throw new Error('La nomina requiere fecha de pago e ingreso neto detectados antes de aplicarla.')
  const transactionMerge = mergeTransactions({ ...profile, accounts }, transactions)
  const lastRowBalance = [...rows].reverse().find((row) => typeof row.balance === 'number')?.balance
  const cardDebtBalance =
    documentExtractedNumber(document, 'currentBalance') ||
    documentExtractedNumber(document, 'totalDebtBalance') ||
    documentExtractedNumber(document, 'cardReconciliationExpectedBalance')
  const closingBalance = isCreditCardStatement
    ? cardDebtBalance
      ? -Math.abs(cardDebtBalance)
      : undefined
    : documentExtractedNumber(document, 'closingBalance') || (typeof lastRowBalance === 'number' ? lastRowBalance : undefined)
  const fallbackDelta = transactionMerge.addedTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const nextAccounts = accounts.map((account) =>
    account.id === accountId
      ? {
          ...account,
          creditLimit: isCreditCardStatement ? documentExtractedNumber(document, 'creditLimit') || account.creditLimit : account.creditLimit,
          balance: typeof closingBalance === 'number' ? closingBalance : Number((account.balance + fallbackDelta).toFixed(2)),
        }
      : account,
  )
  const nextDebts =
    isCreditCardStatement && cardDebtBalance
      ? upsertCreditCardDebt(profile, accountId, institution ? `${institution} tarjeta` : 'Tarjeta importada', cardDebtBalance, {
          balanceIsDebt: true,
          creditLimit: documentExtractedNumber(document, 'creditLimit') || undefined,
          minimumPayment: documentExtractedNumber(document, 'minimumPayment') || undefined,
          dueDate: documentExtractedString(document, 'dueDate') || undefined,
        })
      : profile.debts
  const existingSourceIds = document.sourceTransactionIds ?? []
  const nextDocument: ImportedDocument = {
    ...document,
    status: 'processed',
    summary: `${document.summary} Movimientos revisados aplicados por aprobacion manual: ${transactionMerge.addedTransactions.length}.`,
    extracted: {
      ...document.extracted,
      appliedRows: transactionMerge.addedTransactions.length,
      skippedDuplicateRows: transactionMerge.skippedDuplicateIds.length,
      skippedSemanticDuplicates: transactionMerge.skippedSemanticDuplicates,
      matchedTransactionIds: transactionMerge.matchedTransactionIds,
      reviewedMovementRowsApplied: isPayrollPdf ? transactions.length : rows.length,
      reviewedMovementRowsAppliedAt: new Date().toISOString(),
      reviewedMovementRowsApproval: 'manual_user_action',
    },
    sourceTransactionIds: [...existingSourceIds, ...transactionMerge.addedIds],
    warnings: [
      ...(document.warnings ?? []),
      transactionMerge.addedTransactions.length
        ? `${transactionMerge.addedTransactions.length} movimiento(s) de ${isPayrollPdf ? 'nomina PDF' : isCreditCardStatement ? 'tarjeta' : 'PDF'} aplicados tras revision manual.`
        : 'No se aplicaron movimientos nuevos; las filas revisadas ya estaban duplicadas o incompletas.',
    ],
  }
  const nextProfile = deriveMonthlySnapshots({
    ...profile,
    accounts: nextAccounts,
    debts: nextDebts,
    transactions: transactionMerge.transactions,
    importedDocuments: mergeDocument(profile, nextDocument),
  })

  return {
    profile: nextProfile,
    document: nextDocument,
    summary: `${transactionMerge.addedTransactions.length} movimiento(s) aplicado(s) desde ${document.fileName}; ${transactionMerge.skippedDuplicateIds.length} duplicado(s) omitido(s).`,
  }
}

export async function importFinancialFiles(profile: FinancialProfile, files: File[]): Promise<ImportBatchResult> {
  let nextProfile = profile
  const documents: ImportedDocument[] = []

  for (const file of files) {
    try {
      const result = await importFinancialFile(nextProfile, file)
      nextProfile = result.profile
      documents.push(canonicalImportedDocument(nextProfile, result.document))
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'No se pudo procesar el archivo.'
      const document = rejectedDocument(file, reason)
      nextProfile = {
        ...nextProfile,
        importedDocuments: mergeDocument(nextProfile, document),
      }
      documents.push(canonicalImportedDocument(nextProfile, document))
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  nextProfile = deriveMonthlySnapshots(nextProfile)
  const processed = documents.filter((doc) => doc.status === 'processed').length
  const review = documents.filter((doc) => doc.status === 'needs_review').length
  const rejected = documents.filter((doc) => doc.status === 'rejected').length
  const extractedRows = documents.reduce((sum, doc) => sum + doc.extractedRows, 0)
  const appliedRows = documents.reduce((sum, doc) => sum + (documentExtractedNumber(doc, 'appliedRows') || doc.sourceTransactionIds?.length || 0), 0)
  const skippedDuplicateRows = documents.reduce((sum, doc) => sum + documentExtractedNumber(doc, 'skippedDuplicateRows'), 0)
  return {
    profile: nextProfile,
    documents,
    summary: `${documents.length} archivo(s) procesados: ${processed} listo(s), ${review} para revision, ${rejected} rechazado(s). Se detectaron ${extractedRows} fila(s) o conceptos; ${appliedRows} movimiento(s) aplicados, ${skippedDuplicateRows} duplicado(s) omitidos.`,
  }
}

export async function importFinancialFile(profile: FinancialProfile, file: File): Promise<ImportResult> {
  rejectLargeFile(file)

  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
    return importPdf(profile, file)
  }

  if (file.type.includes('csv') || file.name.toLowerCase().endsWith('.csv')) {
    return importCsv(profile, file)
  }

  if (file.type.includes('xml') || file.name.toLowerCase().endsWith('.xml')) {
    return importXml(profile, file)
  }

  if (isImageFile(file)) {
    return importImage(profile, file)
  }

  throw new Error('Formato no soportado. Usa PDF, CSV, XML, PNG, JPG o WEBP.')
}

async function importPdf(profile: FinancialProfile, file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const fingerprint = await documentFingerprint(file, buffer)
  const pdf = await getDocument({ data: buffer }).promise
  const pageLimit = Math.min(pdf.numPages, 8)
  const pages: PdfTextPage[] = []

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    pages.push(pdfTextPageFromContent(textContent))
  }

  const pagesWithLayoutText = pages.filter((page) => page.text.length > 0).length
  const nativeItemCount = pages.reduce((sum, page) => sum + page.itemCount, 0)
  let fullText = pages.map((page) => page.text || page.plainText).filter(Boolean).join('\n').trim()
  let pdfOcr: OcrResult | null = null
  let pagesWithOcrText = 0
  if (!fullText) {
    pdfOcr = await ocrPdfPages(pdf, pageLimit)
    fullText = pdfOcr.text
    pagesWithOcrText = pdfOcr.text ? pageLimit : 0
  }
  const institution = inferInstitution(file.name, fullText)
  let classification = classifyDocument(file, fullText)
  let statementFacts = extractFinancialDocumentFacts(classification.kind, fullText)
  let extractionQuality = buildExtractionQuality(classification.kind, fullText, statementFacts, pdfOcr?.confidence)
  if (!pdfOcr && shouldRunSupplementalPdfOcr(classification.kind, fullText, statementFacts)) {
    pdfOcr = await ocrPdfPages(pdf, pageLimit)
    if (pdfOcr.text) {
      pagesWithOcrText = pageLimit
      fullText = `${fullText}\n${pdfOcr.text}`.trim()
      classification = classifyDocument(file, fullText)
      statementFacts = extractFinancialDocumentFacts(classification.kind, fullText)
      extractionQuality = buildExtractionQuality(classification.kind, fullText, statementFacts, pdfOcr.confidence)
    }
  }
  const pdfTextMode: PdfTextMode = fullText
    ? pdfOcr
      ? pagesWithLayoutText
        ? 'layout+ocr'
        : 'ocr'
      : 'layout'
    : 'empty'
  const finalKind = classification.kind === 'unknown' ? 'bank_statement' : classification.kind
  if (finalKind === 'bank_statement') {
    const pdfOpeningBalance = finiteNumberFact(statementFacts, 'openingBalance')
    const pdfClosingBalance = finiteNumberFact(statementFacts, 'closingBalance')
    const pdfDepositsTotal = finiteNumberFact(statementFacts, 'depositsTotal')
    const pdfWithdrawalsTotal = finiteNumberFact(statementFacts, 'withdrawalsTotal')
    const pdfNetCashFlow =
      pdfDepositsTotal === undefined || pdfWithdrawalsTotal === undefined ? undefined : Number((pdfDepositsTotal - pdfWithdrawalsTotal).toFixed(2))
    const pdfExpectedClosingBalance =
      pdfOpeningBalance === undefined || pdfNetCashFlow === undefined ? undefined : Number((pdfOpeningBalance + pdfNetCashFlow).toFixed(2))
    const pdfBankBalanceDifference =
      pdfExpectedClosingBalance === undefined || pdfClosingBalance === undefined ? undefined : Number((pdfClosingBalance - pdfExpectedClosingBalance).toFixed(2))
    statementFacts = cleanFacts({
      ...statementFacts,
      netCashFlow: statementFacts.netCashFlow ?? pdfNetCashFlow,
      expectedClosingBalance: pdfExpectedClosingBalance,
      bankBalanceDifference: pdfBankBalanceDifference,
      bankReconciliationStatus:
        pdfExpectedClosingBalance === undefined || pdfClosingBalance === undefined
          ? 'insufficient'
          : Math.abs(pdfBankBalanceDifference ?? 0) <= 1
            ? 'balanced'
            : 'mismatch',
    })
  }
  const accountBacked = ['credit_card_statement', 'investment_statement', 'bank_statement'].includes(finalKind)
  const accountType = finalKind === 'investment_statement'
    ? isRetirementText(`${file.name} ${fullText}`) || statementFacts.retirementProduct
      ? 'retirement'
      : 'investment'
    : finalKind === 'credit_card_statement'
      ? 'credit_card'
      : finalKind === 'bank_statement' && statementFacts.savingsProduct
        ? 'savings'
        : 'checking'
  const existingFingerprintDocument = profile.importedDocuments.find((row) => row.documentFingerprint === fingerprint)
  const existingAccountId = typeof existingFingerprintDocument?.extracted?.accountId === 'string' ? existingFingerprintDocument.extracted.accountId : ''
  const accountId = existingAccountId || `account-${slug(institution ?? file.name)}-${accountType}`
  const openingOrClosingBalance =
    fullText.match(/saldo\s+(?:final|actual|al\s+corte)[^\d-]*(-?[\d,.]+)/i)?.[1] ??
    fullText.match(/balance[^\d-]*(-?[\d,.]+)/i)?.[1]
  const balance =
    Number(statementFacts.currentBalance ?? 0) ||
    Number(statementFacts.closingBalance ?? 0) ||
    Number(statementFacts.portfolioValue ?? 0) ||
    parseMoney(openingOrClosingBalance)
  const { accounts } = accountBacked
    ? getOrCreateAccount(profile, {
        id: accountId,
        name: institution ? `${institution} ${accountType === 'credit_card' ? 'tarjeta' : 'cuenta'}` : `Cuenta ${file.name}`,
        type: accountType,
        balance: 0,
        currency: 'MXN',
        creditLimit: accountType === 'credit_card' && Number(statementFacts.creditLimit ?? 0) ? Number(statementFacts.creditLimit) : undefined,
      })
    : { accounts: profile.accounts }
  const missingFieldWarnings =
    extractionQuality.missingFields.length > 0
      ? [`Campos clave no detectados: ${extractionQuality.missingFields.join(', ')}.`]
      : []
  const cardReconciliationWarnings =
    finalKind === 'credit_card_statement' && statementFacts.cardReconciliationStatus === 'mismatch'
      ? [`Conciliacion de tarjeta no cuadra; diferencia detectada ${Number(statementFacts.cardReconciliationDifference ?? 0).toFixed(2)}.`]
      : finalKind === 'credit_card_statement' && statementFacts.cardReconciliationStatus === 'insufficient'
        ? ['Conciliacion de tarjeta incompleta; faltan saldo anterior, cargos o saldo actual.']
        : []

  const document: ImportedDocument = {
    id: docId(file),
    documentFingerprint: fingerprint,
    fingerprintVersion,
    fileName: file.name,
    fileType: 'pdf',
    kind: finalKind,
    detectedInstitution: institution,
    importedAt: new Date().toISOString(),
    status: 'needs_review',
    summary: fullText
      ? pdfOcr
        ? `PDF hibrido analizado con texto nativo y OCR local en ${pageLimit} pagina(s). Se detectaron ${extractionQuality.detectedFields}/${extractionQuality.expectedFields} campo(s) clave; requiere revision antes de aplicar movimientos.`
        : `PDF leido localmente con layout en ${pageLimit} de ${pdf.numPages} pagina(s). Se detectaron ${extractionQuality.detectedFields}/${extractionQuality.expectedFields} campo(s) clave; movimientos requieren revision.`
      : `PDF leido con ${pdf.numPages} pagina(s), sin texto extraible. Puede requerir OCR.`,
    extractedRows: 0,
    confidence: pdfOcr
      ? Math.min(classification.confidence, pdfOcr.confidence, Math.max(0.3, extractionQuality.qualityScore))
      : Number(((classification.confidence + extractionQuality.qualityScore) / 2).toFixed(2)),
    classificationReasons: classification.reasons,
    extracted: {
      ...statementFacts,
      qualitySchemaVersion,
      pages: pdf.numPages,
      pdfTextMode,
      pdfTextPagesRead: pageLimit,
      pagesWithLayoutText,
      pagesWithOcrText,
      nativeTextItems: nativeItemCount,
      appliedRows: 0,
      accountId: accountBacked ? accountId : undefined,
      accountType: accountBacked ? accountType : undefined,
      balanceDetected: Boolean(openingOrClosingBalance || balance),
      balancePendingReview: Boolean(openingOrClosingBalance || balance),
      ocrConfidence: pdfOcr?.confidence,
      qualityScore: extractionQuality.qualityScore,
      textLength: extractionQuality.textLength,
      detectedFields: extractionQuality.detectedFields,
      expectedFields: extractionQuality.expectedFields,
      missingFields: extractionQuality.missingFields,
      textPreview: pdfOcr ? ocrTextPreview(pdfOcr.text) : undefined,
    },
    warnings: fullText
      ? [
          pdfOcr
            ? 'OCR local aplicado a PDF escaneado; valida campos antes de convertirlos en movimientos.'
            : 'Extraccion PDF conservadora: los saldos detectados quedan pendientes de revision y no se aplican automaticamente.',
          ...missingFieldWarnings,
          ...cardReconciliationWarnings,
        ]
      : ['PDF sin texto extraible; requiere OCR antes de poblar movimientos.'],
  }

  return {
    profile: { ...profile, accounts, importedDocuments: mergeDocument(profile, document) },
    document,
  }
}

async function importCsv(profile: FinancialProfile, file: File): Promise<ImportResult> {
  const text = await file.text()
  const fingerprint = await documentFingerprint(file)
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })

  const isAmexActivitySchema = csvHasAmexActivitySchema(parsed.meta.fields ?? [])
  const isBankMovementSchema = csvHasBankMovementSchema(parsed.meta.fields ?? [])
  const isInvestmentOperationSchema = csvHasInvestmentOperationSchema(parsed.meta.fields ?? [])
  const isRetirementSubaccountSchema = csvHasRetirementSubaccountSchema(parsed.meta.fields ?? [])
  const investmentCsvFacts = isInvestmentOperationSchema ? csvInvestmentOperationRows(parsed.data) : {}
  const retirementCsvFacts = isRetirementSubaccountSchema ? csvRetirementSubaccountFacts(parsed.data, `${file.name}\n${text.slice(0, 4000)}`) : {}
  const savingsCsvFacts = isBankMovementSchema ? csvSavingsStatementFacts(parsed.data, `${file.name}\n${text.slice(0, 4000)}`) : {}
  const classification = classifyDocument(
    file,
    text.slice(0, 1000),
    isRetirementSubaccountSchema || isInvestmentOperationSchema
      ? 'investment_statement'
      : text.includes('Aparece en su Estado de Cuenta') || isAmexActivitySchema
      ? 'credit_card_statement'
      : isBankMovementSchema
        ? 'bank_statement'
        : undefined,
  )
  const institution = isAmexActivitySchema ? 'American Express' : inferInstitution(file.name, text.slice(0, 500))
  const accountType =
    classification.kind === 'investment_statement'
      ? isRetirementSubaccountSchema || isRetirementText(`${file.name} ${text.slice(0, 1000)}`)
        ? 'retirement'
        : 'investment'
      : classification.kind === 'bank_statement'
        ? 'checking'
        : 'credit_card'
  const accountId = `account-${slug(institution ?? (accountType === 'credit_card' ? 'tarjeta' : 'cuenta'))}-${accountType}`
  const { accounts } = getOrCreateAccount(profile, {
    id: accountId,
    name: institution ? `${institution} ${accountType === 'credit_card' ? 'tarjeta' : 'cuenta'}` : accountType === 'credit_card' ? 'Tarjeta importada' : 'Cuenta importada',
    type: accountType,
    balance: 0,
    currency: 'MXN',
  })

  let skippedRows = 0
  let unparsedDates = 0
  let conflictingAmountRows = 0
  let ambiguousDirectionRows = 0
  let balanceDeltaInferredRows = 0
  let balanceDeltaDepositRows = 0
  let balanceDeltaWithdrawalRows = 0
  const amountSources: Record<string, number> = {}
  let bankMovementRows = 0
  let depositRows = 0
  let depositsTotal = 0
  let withdrawalsTotal = 0
  let incomeTotal = 0
  let expenseTotal = 0
  let transferInTotal = 0
  let transferOutTotal = 0
  let debtPaymentTotal = 0
  let payrollDepositTotal = 0
  let incomeRows = 0
  let expenseRows = 0
  let transferRows = 0
  let debtPaymentRows = 0
  let payrollDepositRows = 0
  let withdrawalRows = 0
  let payrollAccountDepositRows = 0
  let payrollAccountWithdrawalRows = 0
  let openingBalance: number | undefined
  let closingBalance: number | undefined
  const transactions = isInvestmentOperationSchema || isRetirementSubaccountSchema
    ? []
    : parsed.data.slice(0, 1000).map((row, index) => {
      const rawDate = getRowValue(row, ['Fecha', 'Date', 'Fecha de Compra', 'Transaction Date'])
      const date = normalizeDate(rawDate)
      const description =
        sanitizeImportedText(
          getRowValue(row, [
            'Aparece en su Estado de Cuenta como',
            'Appears On Your Statement As',
            'Descripcion',
            'Descripción',
            'Description',
            'Merchant',
            'Comercio',
            'Información Adicional',
          ]),
        ) ||
        'Movimiento importado'
      const chargeRaw = getRowValue(row, csvChargeFields)
      const creditRaw = getRowValue(row, csvCreditFields)
      const balanceRaw = getRowValue(row, ['Saldo', 'Saldo final', 'Saldo actual', 'Balance'])
      const rowBalance = balanceRaw ? parseMoney(balanceRaw) : undefined
      if (isBankMovementSchema && parseMoney(chargeRaw) && parseMoney(creditRaw)) {
        conflictingAmountRows += 1
        skippedRows += 1
        return null
      }
      const rawParsedAmount = csvAmountForRow(row, accountType, isAmexActivitySchema, description)
      const balanceInferredAmount =
        isBankMovementSchema && rawParsedAmount?.source === 'signed' && rawParsedAmount.amount > 0
          ? inferBankAmountFromBalanceDelta(rawParsedAmount.amount, closingBalance, rowBalance)
          : null
      const parsedAmount = balanceInferredAmount ?? rawParsedAmount
      if (!date || !parsedAmount) {
        skippedRows += 1
        if (rawDate && !date) unparsedDates += 1
        return null
      }
      if (balanceInferredAmount) {
        balanceDeltaInferredRows += 1
        if (balanceInferredAmount.amount > 0) balanceDeltaDepositRows += 1
        if (balanceInferredAmount.amount < 0) balanceDeltaWithdrawalRows += 1
      }
      if (isBankMovementSchema && parsedAmount.source === 'signed' && parsedAmount.amount > 0) {
        ambiguousDirectionRows += 1
        skippedRows += 1
        return null
      }
      amountSources[parsedAmount.source] = (amountSources[parsedAmount.source] ?? 0) + 1
      if (isBankMovementSchema) {
        bankMovementRows += 1
        if (parsedAmount.amount > 0) {
          depositRows += 1
          depositsTotal += parsedAmount.amount
        }
        if (parsedAmount.amount < 0) withdrawalsTotal += Math.abs(parsedAmount.amount)
        if (hasPayrollContext(`${file.name} ${description}`)) {
          if (parsedAmount.amount > 0) payrollAccountDepositRows += 1
          if (parsedAmount.amount < 0) payrollAccountWithdrawalRows += 1
        }
        if (rowBalance !== undefined) {
          if (openingBalance === undefined) openingBalance = Number((rowBalance - parsedAmount.amount).toFixed(2))
          closingBalance = rowBalance
        }
      }
      const baseMovement = classifyFinancialMovement(description, parsedAmount.amount, accountType, parsedAmount.type)
      const movement =
        isBankMovementSchema &&
        parsedAmount.amount > 0 &&
        hasPayrollContext(`${file.name} ${description}`) &&
        baseMovement.type === 'income' &&
        baseMovement.category === 'Ingreso por clasificar'
          ? { type: 'income' as const, category: 'Nomina' }
          : baseMovement
      if (isBankMovementSchema) {
        const absoluteAmount = Math.abs(parsedAmount.amount)
        if (movement.type === 'income') {
          incomeRows += 1
          incomeTotal += Math.max(0, parsedAmount.amount)
        }
        if (movement.type === 'expense') {
          expenseRows += 1
          expenseTotal += absoluteAmount
        }
        if (movement.type === 'transfer') {
          transferRows += 1
          if (parsedAmount.amount > 0) transferInTotal += parsedAmount.amount
          if (parsedAmount.amount < 0) transferOutTotal += absoluteAmount
        }
        if (movement.type === 'debt_payment') {
          debtPaymentRows += 1
          debtPaymentTotal += absoluteAmount
        }
        if (movement.category === 'Nomina' && parsedAmount.amount > 0) {
          payrollDepositRows += 1
          payrollDepositTotal += parsedAmount.amount
        }
        if (parsedAmount.amount < 0) withdrawalRows += 1
      }
      return buildTransaction(
        {
          date,
          amount: parsedAmount.amount,
          merchant: description,
          category: movement.category,
          accountId,
          type: movement.type,
        },
        file,
        index,
      )
      })
      .filter((tx): tx is Transaction => Boolean(tx))

  const transactionMerge = mergeTransactions(profile, transactions)
  const csvInvestmentFacts = cleanFacts({ ...investmentCsvFacts, ...retirementCsvFacts })
  const investmentExtractionQuality =
    isInvestmentOperationSchema || isRetirementSubaccountSchema ? buildExtractionQuality('investment_statement', text, csvInvestmentFacts) : null
  const cardBalance = transactionMerge.addedTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const netCashFlow = Number((depositsTotal - withdrawalsTotal).toFixed(2))
  const expectedClosingBalance = openingBalance === undefined ? undefined : Number((openingBalance + netCashFlow).toFixed(2))
  const bankBalanceDifference =
    expectedClosingBalance === undefined || closingBalance === undefined ? undefined : Number((closingBalance - expectedClosingBalance).toFixed(2))
  const incompleteDataRows = Math.max(0, skippedRows - unparsedDates - conflictingAmountRows - ambiguousDirectionRows)
  const bankReconciliationStatus =
    !isBankMovementSchema || expectedClosingBalance === undefined || closingBalance === undefined
      ? 'insufficient'
      : Math.abs(bankBalanceDifference ?? 0) <= 1
        ? 'balanced'
        : 'mismatch'
  const nextAccounts = accounts.map((account) =>
    account.id === accountId ? { ...account, balance: accountType === 'credit_card' ? Math.min(account.balance, cardBalance) : account.balance + cardBalance } : account,
  )
  const document: ImportedDocument = {
    id: docId(file),
    documentFingerprint: fingerprint,
    fingerprintVersion,
    fileName: file.name,
    fileType: 'csv',
    kind: classification.kind === 'unknown' ? 'credit_card_statement' : classification.kind,
    detectedInstitution: institution,
    importedAt: new Date().toISOString(),
    status: isInvestmentOperationSchema || isRetirementSubaccountSchema || parsed.errors.length || unparsedDates || ambiguousDirectionRows ? 'needs_review' : 'processed',
    summary: isRetirementSubaccountSchema
      ? `${Number(retirementCsvFacts.subaccountRows ?? 0)} subcuenta(s) de retiro capturadas desde CSV para revision.`
      : isInvestmentOperationSchema
      ? `${Number(investmentCsvFacts.investmentOperationRowCount ?? 0)} operacion(es) de inversion capturadas desde CSV para revision.`
      : `${transactions.length} movimiento(s) importados localmente desde CSV como ${classification.kind === 'unknown' ? 'estado de cuenta' : classification.kind}.`,
    extractedRows: isRetirementSubaccountSchema
      ? Number(retirementCsvFacts.subaccountRows ?? 0)
      : isInvestmentOperationSchema
        ? Number(investmentCsvFacts.investmentOperationRowCount ?? 0)
        : transactions.length,
    confidence: classification.confidence,
    classificationReasons: classification.reasons,
    extracted: {
      qualitySchemaVersion,
      accountType,
      schema: isAmexActivitySchema
        ? 'amex_account_activity_mx'
        : isRetirementSubaccountSchema
          ? 'retirement_subaccounts_review'
        : isInvestmentOperationSchema
          ? 'investment_operations_review'
          : isBankMovementSchema
            ? 'bank_movements_deposits_withdrawals'
            : 'generic_csv',
      rows: parsed.data.length,
      skippedRows,
      unparsedDates,
      conflictingAmountRows,
      ambiguousDirectionRows,
      balanceDeltaInferredRows,
      balanceDeltaDepositRows,
      balanceDeltaWithdrawalRows,
      appliedRows: transactionMerge.addedTransactions.length,
      skippedDuplicateRows: transactionMerge.skippedDuplicateIds.length,
      skippedSemanticDuplicates: transactionMerge.skippedSemanticDuplicates,
      matchedTransactionIds: transactionMerge.matchedTransactionIds,
      dedupeReason: transactionMerge.skippedSemanticDuplicates ? 'payroll_semantic_match' : transactionMerge.skippedDuplicateIds.length ? 'exact_transaction_match' : undefined,
      amountSources,
      ...investmentCsvFacts,
      ...retirementCsvFacts,
      ...savingsCsvFacts,
      ...(investmentExtractionQuality
        ? {
            qualityScore: investmentExtractionQuality.qualityScore,
            textLength: investmentExtractionQuality.textLength,
            detectedFields: investmentExtractionQuality.detectedFields,
            expectedFields: investmentExtractionQuality.expectedFields,
            missingFields: investmentExtractionQuality.missingFields,
          }
        : {}),
      ...(isBankMovementSchema
        ? {
            bankMovementRows,
            depositRows,
            depositsTotal,
            withdrawalsTotal,
            netCashFlow,
            incomeTotal: Number(incomeTotal.toFixed(2)),
            expenseTotal: Number(expenseTotal.toFixed(2)),
            transferInTotal: Number(transferInTotal.toFixed(2)),
            transferOutTotal: Number(transferOutTotal.toFixed(2)),
            debtPaymentTotal: Number(debtPaymentTotal.toFixed(2)),
            payrollDepositTotal: Number(payrollDepositTotal.toFixed(2)),
            incomeRows,
            expenseRows,
            transferRows,
            debtPaymentRows,
            balanceDeltaInferredRows,
            balanceDeltaDepositRows,
            balanceDeltaWithdrawalRows,
            payrollDepositRows,
            withdrawalRows,
            payrollAccountDepositRows,
            payrollAccountWithdrawalRows,
            payrollAccountMixedFlow: payrollAccountDepositRows > 0 && payrollAccountWithdrawalRows > 0,
            openingBalance,
            closingBalance,
            expectedClosingBalance,
            bankBalanceDifference,
            bankReconciliationStatus,
          }
        : {}),
    },
    sourceTransactionIds: transactionMerge.addedIds,
    warnings: [
      ...(parsed.errors.length ? [`${parsed.errors.length} fila(s) con advertencias de CSV.`] : []),
      ...(unparsedDates ? [`${unparsedDates} fila(s) omitida(s) por fecha no reconocida.`] : []),
      ...(conflictingAmountRows ? [`${conflictingAmountRows} fila(s) omitida(s) porque traen deposito y retiro al mismo tiempo.`] : []),
      ...(ambiguousDirectionRows ? [`${ambiguousDirectionRows} fila(s) omitida(s) porque el monto positivo no indica si es deposito o retiro; revisa el estado de cuenta antes de aplicarla.`] : []),
      ...(balanceDeltaInferredRows
        ? [`${balanceDeltaInferredRows} fila(s) sin direccion fueron clasificadas usando el cambio de saldo del estado de cuenta.`]
        : []),
      ...(isInvestmentOperationSchema
        ? ['CSV de inversion capturado como evidencia de portafolio; operaciones, comisiones e impuestos quedan en revision y no alteran ingresos/gastos automaticamente.']
        : []),
      ...(payrollAccountDepositRows > 0 && payrollAccountWithdrawalRows > 0
        ? ['Estado de cuenta de nomina con depositos y retiros: solo los depositos claramente identificados como nomina cuentan como ingreso; los retiros se clasifican por concepto.']
        : []),
      ...(incompleteDataRows ? [`${incompleteDataRows} fila(s) omitida(s) por datos incompletos.`] : []),
      ...(isBankMovementSchema && bankReconciliationStatus === 'mismatch'
        ? [`Conciliacion bancaria no cuadra; diferencia detectada ${Number(bankBalanceDifference ?? 0).toFixed(2)}.`]
        : []),
      ...(transactionMerge.skippedSemanticDuplicates
        ? [`${transactionMerge.skippedSemanticDuplicates} movimiento(s) de nomina ya existian como deposito equivalente, cercano o dividido; no se duplicaron en el dashboard.`]
        : []),
      ...(transactionMerge.skippedDuplicateIds.length > transactionMerge.skippedSemanticDuplicates
        ? [`${transactionMerge.skippedDuplicateIds.length - transactionMerge.skippedSemanticDuplicates} movimiento(s) exacto(s) ya existian; se omitieron.`]
        : []),
    ],
  }

  const nextDebts =
    accountType === 'credit_card'
      ? upsertCreditCardDebt(profile, accountId, institution ? `${institution} tarjeta` : 'Tarjeta importada', cardBalance)
      : profile.debts

  return {
    profile: {
      ...profile,
      accounts: nextAccounts,
      debts: nextDebts,
      transactions: transactionMerge.transactions,
      importedDocuments: mergeDocument(profile, document),
    },
    document,
  }
}

async function importImage(profile: FinancialProfile, file: File): Promise<ImportResult> {
  const fingerprint = await documentFingerprint(file)
  let ocr: OcrResult
  try {
    ocr = await recognizeImages([file])
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'OCR local no disponible para esta imagen.'
    const document = rejectedDocument(file, `OCR local fallo: ${reason}`, 'purchase_receipt')
    return {
      profile: { ...profile, importedDocuments: mergeDocument(profile, document) },
      document,
    }
  }
  const facts = extractReceiptFacts(ocr.text)
  const classification = classifyDocument(file, ocr.text, 'purchase_receipt')
  const accountId = 'account-recibos-por-clasificar'
  const { accounts } = getOrCreateAccount(profile, {
    id: accountId,
    name: 'Tickets y recibos por clasificar',
    type: 'checking',
    balance: 0,
    currency: 'MXN',
  })
  const canApplyTransaction = facts.total > 0 && Boolean(facts.date) && ocr.confidence >= 0.75
  const amount = -Math.abs(facts.total)
  const transactions = canApplyTransaction
    ? [
        buildTransaction(
          {
            date: facts.date,
            amount,
            merchant: facts.merchant,
            category: classifyFinancialMovement(`${facts.merchant} recibo ticket compra`, amount, 'checking', 'expense').category,
            accountId,
            type: 'expense',
          },
          file,
          0,
        ),
      ]
    : []
  const transactionMerge = mergeTransactions(profile, transactions)
  const appliedReceiptAmount = transactionMerge.addedTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const nextAccounts = accounts.map((account) =>
    account.id === accountId && transactionMerge.addedTransactions.length ? { ...account, balance: account.balance + appliedReceiptAmount } : account,
  )
  const warnings = [
    'OCR local con tesseract.js; valida comercio, fecha y total antes de usarlo como dato definitivo.',
    ...(!facts.date ? ['Fecha no detectada; el movimiento queda pendiente de revision.'] : []),
    ...(!facts.total ? ['Total no detectado; revisa manualmente el recibo.'] : []),
    ...(ocr.confidence < 0.75 ? [`Confianza OCR baja (${Math.round(ocr.confidence * 100)}%).`] : []),
    ...(transactionMerge.skippedDuplicateIds.length ? [`${transactionMerge.skippedDuplicateIds.length} movimiento(s) de recibo ya existian; se omitieron.`] : []),
  ]
  const document: ImportedDocument = {
    id: docId(file),
    documentFingerprint: fingerprint,
    fingerprintVersion,
    fileName: file.name,
    fileType: 'image',
    kind: 'purchase_receipt',
    detectedInstitution: facts.merchant,
    importedAt: new Date().toISOString(),
    status: canApplyTransaction ? 'processed' : 'needs_review',
    summary: canApplyTransaction
      ? `Recibo analizado con OCR local: ${facts.merchant}, total ${facts.total}.`
      : 'Imagen analizada con OCR local; faltan campos para aplicar movimiento automaticamente.',
    extractedRows: transactions.length,
    confidence: Math.min(classification.confidence, ocr.confidence),
    classificationReasons: [...classification.reasons, 'OCR local aplicado a imagen'],
    extracted: {
      qualitySchemaVersion,
      merchant: facts.merchant,
      date: facts.date,
      total: facts.total,
      iva: facts.iva,
      ocrConfidence: ocr.confidence,
      textPreview: ocrTextPreview(ocr.text),
      appliedRows: transactionMerge.addedTransactions.length,
      skippedDuplicateRows: transactionMerge.skippedDuplicateIds.length,
      matchedTransactionIds: transactionMerge.matchedTransactionIds,
      dedupeReason: transactionMerge.skippedDuplicateIds.length ? 'exact_transaction_match' : undefined,
    },
    sourceTransactionIds: transactionMerge.addedIds,
    warnings,
  }

  return {
    profile: {
      ...profile,
      accounts: nextAccounts,
      transactions: transactionMerge.transactions,
      importedDocuments: mergeDocument(profile, document),
    },
    document,
  }
}

async function importXml(profile: FinancialProfile, file: File): Promise<ImportResult> {
  const text = await file.text()
  const fingerprint = await documentFingerprint(file)
  const xml = parseXmlText(text, file.name)
  const comprobante = firstXmlRecord(xml, 'Comprobante')
  const cfdiWarnings = cfdiGuardWarnings(text, comprobante)
  const verifiableCfdi = isVerifiableCfdi(text, comprobante)
  const hasPayrollSignal = xmlTextHasPayrollSignal(text)
  const nomina = firstXmlRecord(xml, 'Nomina')
  const emisor = firstXmlRecord(xml, 'Emisor')
  const cfdiReceptor = firstXmlRecord(xml, 'Receptor')
  const receptor =
    findXmlRecords(xml, 'Receptor').find(
      (node) => attr(node, 'CuentaBancaria') || attr(node, 'NumEmpleado') || attr(node, 'SalarioDiarioIntegrado'),
    ) ?? cfdiReceptor
  const percepciones = findXmlRecords(xml, 'Percepcion')
  const deducciones = findXmlRecords(xml, 'Deduccion')
  const otrosPagos = findXmlRecords(xml, 'OtroPago')

  if (!nomina) {
    return importInvoiceXml(profile, file, xml, text, comprobante, emisor, receptor, fingerprint)
  }

  const timbre = firstXmlRecord(xml, 'TimbreFiscalDigital')
  const payrollEmitter = findXmlRecords(xml, 'Emisor').find((node) => attr(node, 'RegistroPatronal')) ?? null
  const payrollPerceptions = firstXmlRecord(xml, 'Percepciones')
  const payrollDeductions = firstXmlRecord(xml, 'Deducciones')
  const employmentSubsidy = firstXmlRecord(xml, 'SubsidioAlEmpleo')
  const compensationBalance = firstXmlRecord(xml, 'CompensacionSaldosAFavor')
  const fechaPago = normalizeDate(attr(nomina, 'FechaPago') || attr(comprobante, 'Fecha'))
  const periodStart = normalizeDate(attr(nomina, 'FechaInicialPago'))
  const periodEnd = normalizeDate(attr(nomina, 'FechaFinalPago'))
  const payrollType = attr(nomina, 'TipoNomina')
  const payrollComplementVersion = attr(nomina, 'Version') || attr(nomina, 'version')
  const paidDays = Number(attr(nomina, 'NumDiasPagados')) || 0
  const total = parseMoney(attr(comprobante, 'Total'))
  const totalPercepciones = parseMoney(attr(nomina, 'TotalPercepciones'))
  const totalDeducciones = parseMoney(attr(nomina, 'TotalDeducciones'))
  const totalOtrosPagos = parseMoney(attr(nomina, 'TotalOtrosPagos'))
  const netIncome = total || Math.max(0, totalPercepciones + totalOtrosPagos - totalDeducciones)
  const employerName = attr(emisor, 'Nombre') || 'Nomina'
  const employerRfcSuffix = suffix(attr(emisor, 'Rfc'))
  const employeeRfcSuffix = suffix(attr(cfdiReceptor, 'Rfc'))
  const employeeCurpSuffix = suffix(attr(receptor, 'Curp'))
  const employeeNssSuffix = suffix(attr(receptor, 'NumSeguridadSocial'))
  const employeeNumberSuffix = suffix(attr(receptor, 'NumEmpleado'))
  const payrollUuidSuffix = suffix(attr(timbre, 'UUID'), 8)
  const employerRegistrationSuffix = suffix(attr(payrollEmitter, 'RegistroPatronal'))
  const payrollPeriodicity = attr(receptor, 'PeriodicidadPago')
  const contractType = attr(receptor, 'TipoContrato')
  const workdayType = attr(receptor, 'TipoJornada')
  const employmentRegime = attr(receptor, 'TipoRegimen')
  const riskPosition = attr(receptor, 'RiesgoPuesto')
  const federalEntity = attr(receptor, 'ClaveEntFed')
  const bankCode = attr(receptor, 'Banco')
  const baseContributionSalary = parseMoney(attr(receptor, 'SalarioBaseCotApor'))
  const dailyIntegratedSalary = parseMoney(attr(receptor, 'SalarioDiarioIntegrado'))
  const totalSalaries = parseMoney(attr(payrollPerceptions, 'TotalSueldos'))
  const totalPerceptionsTaxable = parseMoney(attr(payrollPerceptions, 'TotalGravado'))
  const totalPerceptionsExempt = parseMoney(attr(payrollPerceptions, 'TotalExento'))
  const totalTaxesWithheld = parseMoney(attr(payrollDeductions, 'TotalImpuestosRetenidos'))
  const totalOtherDeductions = parseMoney(attr(payrollDeductions, 'TotalOtrasDeducciones'))
  const employmentSubsidyAmount = parseMoney(attr(employmentSubsidy, 'SubsidioCausado'))
  const compensatedBalance = parseMoney(attr(compensationBalance, 'SaldoAFavor'))
  const perceptionConcepts = payrollConceptDetails(percepciones, 'perception')
  const deductionConcepts = payrollConceptDetails(deducciones, 'deduction')
  const otherPaymentConcepts = payrollConceptDetails(otrosPagos, 'other')
  const isrWithheld = payrollConceptTotal(deducciones, [/isr|impuesto\s+sobre\s+la\s+renta/], ['002'])
  const imssWithheld = payrollConceptTotal(deducciones, [/imss|seguro\s+social/], ['001'])
  const infonavitWithheld = payrollConceptTotal(deducciones, [/infonavit|credito\s+infonavit|vivienda/], ['009', '010', '011'])
  const payrollQualityScore = payrollCompletenessScore([
    fechaPago,
    periodStart,
    periodEnd,
    payrollType,
    payrollComplementVersion,
    payrollPeriodicity,
    paidDays,
    totalPercepciones,
    totalDeducciones,
    netIncome,
    perceptionConcepts,
    deductionConcepts,
  ])
  const accountSuffix = suffix(attr(receptor, 'CuentaBancaria'))
  const accountId = `account-nomina-${accountSuffix || 'cfdi'}`
  const { accounts } = getOrCreateAccount(profile, {
    id: accountId,
    name: accountSuffix ? `Cuenta nomina ${accountSuffix}` : 'Cuenta nomina',
    type: 'checking',
    balance: 0,
    currency: 'MXN',
  })

  const dateWarning = fechaPago ? '' : 'Fecha de pago no reconocida; ingreso no aplicado automaticamente.'
  const canApplyPayroll = verifiableCfdi && hasPayrollSignal && Boolean(netIncome) && Boolean(fechaPago)
  const transactions = canApplyPayroll
    ? [
        buildTransaction(
          {
            date: fechaPago,
            amount: netIncome,
            merchant: `Nomina ${employerName}`,
            category: classifyFinancialMovement(`Nomina ${employerName}`, netIncome, 'checking', 'income').category,
            accountId,
            type: 'income',
          },
          file,
          0,
        ),
      ]
    : []
  const transactionMerge = mergeTransactions(profile, transactions)

  const nextAccounts = accounts.map((account) =>
    account.id === accountId && transactionMerge.addedTransactions.length ? { ...account, balance: account.balance + netIncome } : account,
  )
  const payrollExtracted: Record<string, unknown> = {
    paymentDate: fechaPago,
    periodStart,
    periodEnd,
    payrollType,
    payrollComplementVersion,
    payrollPeriodicity,
    paidDays,
    employerName,
    employerRfcSuffix,
    employeeRfcSuffix,
    employeeCurpSuffix,
    employeeNssSuffix,
    employeeNumberSuffix,
    employerRegistrationSuffix,
    payrollUuidSuffix,
    contractType,
    workdayType,
    employmentRegime,
    riskPosition,
    federalEntity,
    bankCode,
    totalPercepciones,
    totalDeducciones,
    totalOtrosPagos,
    totalSalaries,
    totalPerceptionsTaxable,
    totalPerceptionsExempt,
    totalTaxesWithheld,
    totalOtherDeductions,
    employmentSubsidyAmount,
    compensatedBalance,
    netIncome,
    baseContributionSalary,
    dailyIntegratedSalary,
    isrWithheld,
    imssWithheld,
    infonavitWithheld,
    perceptionConcepts,
    deductionConcepts,
    otherPaymentConcepts,
    qualityScore: payrollQualityScore,
    accountSuffix,
    appliedRows: transactionMerge.addedTransactions.length,
    skippedDuplicateRows: transactionMerge.skippedDuplicateIds.length,
    skippedSemanticDuplicates: transactionMerge.skippedSemanticDuplicates,
    matchedTransactionIds: transactionMerge.matchedTransactionIds,
    dedupeReason: transactionMerge.skippedSemanticDuplicates ? 'payroll_semantic_match' : transactionMerge.skippedDuplicateIds.length ? 'exact_transaction_match' : undefined,
  }
  const payrollExpectedFields = expectedFieldKeysForExtracted('payroll_cfdi', payrollExtracted)
  const payrollMissingFields = payrollExpectedFields.filter((field) => !extractedValuePopulated(payrollExtracted[field]))

  const document: ImportedDocument = {
    id: docId(file),
    documentFingerprint: fingerprint,
    fingerprintVersion,
    fileName: file.name,
    fileType: 'xml',
    kind: verifiableCfdi && hasPayrollSignal ? 'payroll_cfdi' : 'unknown',
    detectedInstitution: employerName,
    importedAt: new Date().toISOString(),
    status: canApplyPayroll ? 'processed' : 'needs_review',
    summary: verifiableCfdi && hasPayrollSignal
      ? `CFDI de nomina importado: ingreso neto detectado, ${percepciones.length} percepcion(es), ${deducciones.length} deduccion(es), ${otrosPagos.length} otro(s) pago(s).`
      : 'XML con estructura parecida a nomina, pero no verificable como CFDI SAT; no se aplicaron movimientos automaticamente.',
    extractedRows: percepciones.length + deducciones.length + otrosPagos.length + transactions.length,
    confidence: canApplyPayroll ? 0.95 : 0.45,
    classificationReasons: verifiableCfdi && hasPayrollSignal
      ? ['complemento de nomina CFDI/SAT detectado']
      : ['estructura XML de nomina no verificable como CFDI/SAT'],
    extracted: {
      ...payrollExtracted,
      qualitySchemaVersion,
      detectedFields: payrollExpectedFields.length - payrollMissingFields.length,
      expectedFields: payrollExpectedFields.length,
      missingFields: payrollMissingFields,
    },
    sourceTransactionIds: transactionMerge.addedIds,
    warnings: [
      'XML validado con fast-xml-parser; no se conserva el archivo crudo.',
      ...cfdiWarnings,
      ...(!hasPayrollSignal ? ['No se detecto namespace de nomina SAT; ingreso no aplicado automaticamente.'] : []),
      ...(dateWarning ? [dateWarning] : []),
      ...(!netIncome ? ['Ingreso neto no detectado; revisa totales de nomina.'] : []),
      ...(transactionMerge.skippedSemanticDuplicates
        ? [`${transactionMerge.skippedSemanticDuplicates} ingreso(s) de nomina ya existian como deposito equivalente, cercano o dividido; el CFDI queda como evidencia y no duplica el dashboard.`]
        : []),
      ...(transactionMerge.skippedDuplicateIds.length > transactionMerge.skippedSemanticDuplicates
        ? [`${transactionMerge.skippedDuplicateIds.length - transactionMerge.skippedSemanticDuplicates} movimiento(s) exacto(s) ya existian; se omitieron.`]
        : []),
    ],
  }

  return {
    profile: {
      ...profile,
      grossMonthlyIncome: transactions.length ? Math.max(profile.grossMonthlyIncome, totalPercepciones) : profile.grossMonthlyIncome,
      netMonthlyIncome: transactions.length ? Math.max(profile.netMonthlyIncome, netIncome) : profile.netMonthlyIncome,
      accounts: nextAccounts,
      transactions: transactionMerge.transactions,
      importedDocuments: mergeDocument(profile, document),
    },
    document,
  }
}

function invoiceConcepts(xml: XmlRecord) {
  return findXmlRecords(xml, 'Concepto').map((concepto) => ({
    description: attr(concepto, 'Descripcion') || attr(concepto, 'NoIdentificacion') || 'Concepto CFDI',
    amount: parseMoney(attr(concepto, 'Importe')),
    quantity: attr(concepto, 'Cantidad'),
  }))
}

async function importInvoiceXml(
  profile: FinancialProfile,
  file: File,
  xml: XmlRecord,
  xmlText: string,
  comprobante: XmlRecord | null,
  emisor: XmlRecord | null,
  receptor: XmlRecord | null,
  fingerprint: string,
): Promise<ImportResult> {
  const cfdiWarnings = cfdiGuardWarnings(xmlText, comprobante)
  const verifiableCfdi = isVerifiableCfdi(xmlText, comprobante)
  const conceptos = invoiceConcepts(xml)
  const total = parseMoney(attr(comprobante, 'Total'))
  const subtotal = parseMoney(attr(comprobante, 'SubTotal'))
  const fecha = normalizeDate(attr(comprobante, 'Fecha'))
  const tipoComprobante = attr(comprobante, 'TipoDeComprobante')
  const issuerName = attr(emisor, 'Nombre') || 'Emisor CFDI'
  const receiverName = attr(receptor, 'Nombre') || 'Receptor CFDI'
  const timbre = firstXmlRecord(xml, 'TimbreFiscalDigital')
  const uuid = attr(timbre, 'UUID')
  const classification = classifyDocument(file, `${issuerName} ${receiverName} ${conceptos.map((row) => row.description).join(' ')}`, 'invoice_cfdi')
  const accountId = 'account-facturas-por-clasificar'
  const { accounts } = getOrCreateAccount(profile, {
    id: accountId,
    name: 'Facturas por clasificar',
    type: 'checking',
    balance: 0,
    currency: 'MXN',
  })
  const description = conceptos[0]?.description ?? `Factura ${issuerName}`
  const isIncomeInvoice = tipoComprobante === 'I' && /ingreso|cliente|honorario|servicio/i.test(`${description} ${receiverName}`)
  const signedAmount = total ? (isIncomeInvoice ? Math.abs(total) : -Math.abs(total)) : 0
  const dateWarning = fecha ? '' : 'Fecha de factura no reconocida; movimiento no aplicado automaticamente.'
  const canApplyInvoice = verifiableCfdi && Boolean(signedAmount) && Boolean(fecha)
  const transactions = canApplyInvoice
    ? (() => {
        const movement = classifyFinancialMovement(description, signedAmount, 'checking', signedAmount > 0 ? 'income' : 'expense')
        return [
          buildTransaction(
            {
              date: fecha,
              amount: signedAmount,
              merchant: issuerName,
              category: movement.category,
              accountId,
              type: movement.type,
            },
            file,
            0,
          ),
        ]
      })()
    : []
  const transactionMerge = mergeTransactions(profile, transactions)
  const appliedInvoiceAmount = transactionMerge.addedTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const nextAccounts = accounts.map((account) =>
    account.id === accountId && transactionMerge.addedTransactions.length ? { ...account, balance: account.balance + appliedInvoiceAmount } : account,
  )
  const document: ImportedDocument = {
    id: docId(file),
    documentFingerprint: fingerprint,
    fingerprintVersion,
    fileName: file.name,
    fileType: 'xml',
    kind: verifiableCfdi && classification.kind === 'invoice_cfdi' ? 'invoice_cfdi' : 'unknown',
    detectedInstitution: issuerName,
    importedAt: new Date().toISOString(),
    status: canApplyInvoice ? 'processed' : 'needs_review',
    summary: verifiableCfdi
      ? `Factura CFDI detectada: ${issuerName}, ${conceptos.length} concepto(s), total detectado para revision financiera.`
      : 'XML con estructura de factura, pero no verificable como CFDI SAT; no se aplicaron movimientos automaticamente.',
    extractedRows: conceptos.length + transactions.length,
    confidence: verifiableCfdi ? classification.confidence : Math.min(classification.confidence, 0.45),
    classificationReasons: verifiableCfdi ? classification.reasons : ['XML no verificable como CFDI/SAT'],
    extracted: {
      qualitySchemaVersion,
      uuid,
      issuerName,
      receiverName,
      subtotal,
      total,
      tipoComprobante,
      conceptos,
      appliedRows: transactionMerge.addedTransactions.length,
      skippedDuplicateRows: transactionMerge.skippedDuplicateIds.length,
      matchedTransactionIds: transactionMerge.matchedTransactionIds,
      dedupeReason: transactionMerge.skippedDuplicateIds.length ? 'exact_transaction_match' : undefined,
    },
    sourceTransactionIds: transactionMerge.addedIds,
    warnings: [
      'XML validado con fast-xml-parser; no se conserva el archivo crudo.',
      ...cfdiWarnings,
      ...(transactions.length ? ['Factura convertida a movimiento tentativo; valida que no duplique un cargo de tarjeta o banco.'] : []),
      ...(dateWarning ? [dateWarning] : []),
      ...(!total ? ['Factura sin total utilizable para crear movimiento.'] : []),
      ...(transactionMerge.skippedDuplicateIds.length ? [`${transactionMerge.skippedDuplicateIds.length} movimiento(s) de factura ya existian; se omitieron.`] : []),
    ],
  }

  return {
    profile: {
      ...profile,
      accounts: nextAccounts,
      transactions: transactionMerge.transactions,
      importedDocuments: mergeDocument(profile, document),
    },
    document,
  }
}
