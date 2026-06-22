import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import Papa from 'papaparse'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { generateSyntheticDocumentFixtures } from './lib/synthetic-document-fixtures.mjs'
import { getRowValue, normalizeHeader, parseMoney } from './lib/document-inspection.mjs'

function time(label, fn) {
  const start = performance.now()
  const result = fn()
  const ms = performance.now() - start
  return Promise.resolve(result).then((value) => ({ label, ms: Number(ms.toFixed(1)), value }))
}

async function timeAsync(label, fn) {
  const start = performance.now()
  const value = await fn()
  const ms = performance.now() - start
  return { label, ms: Number(ms.toFixed(1)), value }
}

async function benchCsv(csvPath) {
  const text = readFileSync(csvPath, 'utf8')
  return time('papaparse csv', () => {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: normalizeHeader })
    return {
      rows: parsed.data.length,
      errors: parsed.errors.length,
      total: parsed.data.reduce((sum, row) => sum + parseMoney(getRowValue(row, ['Importe', 'Amount', 'Monto', 'Cargo', 'Abono'])), 0),
      detected: parsed.data.some((row) =>
        /NOMINA|SUPERMERCADO|COMERCIO/i.test(
          getRowValue(row, ['Descripcion', 'Descripción', 'Description', 'Aparece en su Estado de Cuenta como']),
        ),
      ),
    }
  })
}

async function benchXml(xmlPath) {
  const text = readFileSync(xmlPath, 'utf8')
  return time('fast-xml-parser cfdi xml', () => {
    const validation = XMLValidator.validate(text)
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      removeNSPrefix: true,
    })
    const parsed = parser.parse(text)
    const comprobante = parsed.Comprobante
    const nomina = comprobante.Complemento.Nomina
    const receptor = nomina.Receptor
    const deducciones = Array.isArray(nomina.Deducciones?.Deduccion) ? nomina.Deducciones.Deduccion : [nomina.Deducciones?.Deduccion].filter(Boolean)
    return {
      valid: validation === true,
      total: parseMoney(comprobante.Total),
      payroll: Boolean(nomina.FechaPago),
      periodDetected: Boolean(nomina.FechaInicialPago && nomina.FechaFinalPago),
      receiverDetected: Boolean(receptor?.PeriodicidadPago && receptor?.SalarioDiarioIntegrado),
      netIncome: parseMoney(comprobante.Total),
      deductions: parseMoney(nomina.TotalDeducciones),
      deductionLines: deducciones.length,
    }
  })
}

async function benchPdf(pdfPath) {
  return timeAsync('pdfjs-dist digital pdf', async () => {
    const bytes = new Uint8Array(readFileSync(pdfPath))
    const pdf = await getDocument({ data: bytes, disableWorker: true }).promise
    let text = ''
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    }
    return {
      pages: pdf.numPages,
      chars: text.length,
      balanceDetected: /saldo final/i.test(text) && /\$?36,?549/.test(text),
      reconciliationDetected: /Saldo anterior/i.test(text) && /Total de cargos/i.test(text) && /Total de pagos/i.test(text),
      movementDetected: /SUPERMERCADO DEMO/i.test(text),
    }
  })
}

async function benchTesseractCli(receiptPath) {
  const available = spawnSync('/opt/homebrew/bin/tesseract', ['--version'], { encoding: 'utf8' })
  if (available.status !== 0) return { label: 'tesseract cli receipt ocr', ms: 0, skipped: true, value: { reason: 'tesseract CLI missing' } }
  const start = performance.now()
  const run = spawnSync('/opt/homebrew/bin/tesseract', [receiptPath, 'stdout', '-l', 'eng', '--psm', '6'], { encoding: 'utf8' })
  const ms = performance.now() - start
  if (run.status !== 0) throw new Error(`Tesseract fallo: ${run.stderr}`)
  return {
    label: 'tesseract cli receipt ocr',
    ms: Number(ms.toFixed(1)),
    value: {
      chars: run.stdout.length,
      merchantDetected: /TIENDA DEMO/i.test(run.stdout),
      totalDetected: /1250[.,]50/.test(run.stdout),
      text: run.stdout.trim().replace(/\s+/g, ' ').slice(0, 160),
    },
  }
}

async function benchTesseractJs(receiptPath) {
  const start = performance.now()
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(receiptPath)
    const ms = performance.now() - start
    return {
      label: 'tesseract.js receipt ocr',
      ms: Number(ms.toFixed(1)),
      value: {
        chars: data.text.length,
        confidence: Math.round(data.confidence),
        merchantDetected: /TIENDA DEMO/i.test(data.text),
        totalDetected: /1250[.,]50/.test(data.text),
        text: data.text.trim().replace(/\s+/g, ' ').slice(0, 160),
      },
    }
  } finally {
    await worker.terminate()
  }
}

const fixtures = generateSyntheticDocumentFixtures()
const results = [
  await benchCsv(fixtures.csvPath),
  await benchXml(fixtures.xmlPath),
  await benchPdf(fixtures.pdfPath),
  await benchTesseractJs(fixtures.receiptPath),
  await benchTesseractCli(fixtures.receiptPath),
]

const summary = {
  generatedAt: new Date().toISOString(),
  fixturePolicy: 'synthetic only; no real financial documents',
  fixtures,
  results,
  recommendation: {
    browserPipeline: ['papaparse', 'fast-xml-parser', 'pdfjs-dist'],
    localOcrBaseline: 'tesseract.js worker in the app; Tesseract CLI remains useful as a local benchmark baseline',
    heavyDocumentUnderstanding: 'evaluate Docling as a local sidecar for scanned PDFs, layout, tables, images, and future XBRL/email support',
  },
}

function assertBenchmark(summary) {
  const byLabel = Object.fromEntries(summary.results.map((result) => [result.label, result]))
  const failures = []
  if (summary.fixturePolicy !== 'synthetic only; no real financial documents') failures.push('fixturePolicy no confirma fixtures sinteticos.')
  if (!byLabel['papaparse csv']?.value?.detected || byLabel['papaparse csv']?.value?.rows !== 3) {
    failures.push('PapaParse no detecto las filas CSV sinteticas esperadas.')
  }
  if (!byLabel['fast-xml-parser cfdi xml']?.value?.valid || !byLabel['fast-xml-parser cfdi xml']?.value?.payroll) {
    failures.push('fast-xml-parser no valido el CFDI nomina sintetico.')
  }
  if (!byLabel['pdfjs-dist digital pdf']?.value?.balanceDetected || !byLabel['pdfjs-dist digital pdf']?.value?.movementDetected) {
    failures.push('PDF.js no detecto saldo y movimiento en PDF sintetico.')
  }
  if (!byLabel['tesseract.js receipt ocr']?.value?.merchantDetected || !byLabel['tesseract.js receipt ocr']?.value?.totalDetected) {
    failures.push('tesseract.js no detecto comercio y total en recibo sintetico.')
  }
  if (failures.length) throw new Error(`Benchmark de documentos fallo:\n- ${failures.join('\n- ')}`)
}

assertBenchmark(summary)
console.log(JSON.stringify(summary, null, 2))
