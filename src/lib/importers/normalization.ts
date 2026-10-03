const supportedImageExtensions = ['.png', '.jpg', '.jpeg', '.webp']
export const fingerprintVersion = 'content-v1'

export function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function docId(file: File) {
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

export async function documentFingerprint(file: File, buffer?: ArrayBuffer) {
  const content = buffer ?? (await file.arrayBuffer())
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', content.slice(0))
    return `sha256:${hexFromBuffer(digest)}`
  }
  return `fnv1a64:${fnv1a64(new Uint8Array(content))}:${file.size}`
}

export function transactionId(file: File, index: number, date: string, amount: number) {
  return `tx-${slug(file.name)}-${index}-${date}-${Math.round(amount * 100)}`
}

export function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function getRowValue(row: Record<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[normalizeHeader(candidate)]
    if (value !== undefined && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function parseMoney(value: string | number | undefined) {
  if (typeof value === 'number') return value
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const negative = raw.includes('(') || raw.includes('-') || /\bdr\b/i.test(raw)
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

export function normalizeDate(value: string) {
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
  const namedDayFirst = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/^(\d{1,2})\s*(?:-|\/)\s*([a-z]{3,10})\.?\s*(?:-|\/)\s*(\d{4})/)
  if (namedDayFirst?.[2] && monthNames[namedDayFirst[2]]) {
    return validIsoDate(
      Number(namedDayFirst[3]),
      Number(monthNames[namedDayFirst[2]]),
      Number(namedDayFirst[1]),
    )
  }
  const monthFirst = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/^([a-z]{3,10})\s+(\d{1,2}),?\s+(\d{4})/)
  const monthFirstNumber = monthFirst?.[1] ? monthNames[monthFirst[1]] : undefined
  if (monthFirst && monthFirstNumber) return validIsoDate(Number(monthFirst[3]), Number(monthFirstNumber), Number(monthFirst[2]))
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

export function sanitizeImportedText(value: string) {
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

export function isImageFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return file.type.startsWith('image/') || supportedImageExtensions.some((extension) => lowerName.endsWith(extension))
}
