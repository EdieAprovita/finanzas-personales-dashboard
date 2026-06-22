import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import Papa from 'papaparse'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

export function supportedDocumentFiles(dir) {
  return walk(dir).filter((path) => ['.csv', '.xml', '.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(extname(path).toLowerCase()))
}

export function normalizeHeader(header) {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function parseMoney(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const negative = raw.includes('(') || raw.includes('-')
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return negative ? -Math.abs(parsed) : parsed
}

function validIsoDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return ''
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeDate(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return validIsoDate(Number(year), Number(dmy[2]), Number(dmy[1]))
  }
  const monthNames = {
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
  if (textDate && monthNames[textDate[2]]) return validIsoDate(Number(textDate[3]), Number(monthNames[textDate[2]]), Number(textDate[1]))
  return ''
}

export function getRowValue(row, candidates) {
  for (const candidate of candidates) {
    const value = row[normalizeHeader(candidate)]
    if (value !== undefined && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function inspectCsv(path) {
  const text = readFileSync(path, 'utf8')
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })
  let unparsedDates = 0
  let amexActivityRows = 0
  let bankMovementRows = 0
  let bankDepositRows = 0
  let bankWithdrawalRows = 0
  let bankDepositsTotal = 0
  let bankWithdrawalsTotal = 0
  let investmentOperationRows = 0
  let investmentBuyRows = 0
  let investmentSellRows = 0
  let investmentIncomeRows = 0
  let investmentCommissionsTotal = 0
  let investmentTaxWithheld = 0
  let savingsProductRows = 0
  let savingsYieldRows = 0
  let retirementSubaccountRows = 0
  let retirementSubaccountBalanceTotal = 0
  const rows = parsed.data.filter((row) => {
    const date = getRowValue(row, ['Fecha', 'Date', 'Fecha de Compra', 'Transaction Date'])
    const description = getRowValue(row, [
      'Descripcion',
      'Descripción',
      'Description',
      'Concepto',
      'Merchant',
      'Comercio',
      'Aparece en su Estado de Cuenta como',
      'Referencia',
      'Información Adicional',
    ])
    const deposit = parseMoney(getRowValue(row, ['Abono', 'Abonos', 'Deposito', 'Depósito', 'Depositos', 'Depósitos']))
    const withdrawal = parseMoney(getRowValue(row, ['Cargo', 'Charge', 'Debit', 'Retiro', 'Retiros']))
    const nature = String(getRowValue(row, ['Tipo', 'Tipo movimiento', 'Tipo de movimiento', 'Naturaleza', 'Cargo/Abono', 'Debito Credito', 'Débito/Crédito']))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const amount = parseMoney(getRowValue(row, ['Importe', 'Amount', 'Monto'])) || deposit || withdrawal
    const account = getRowValue(row, ['Cuenta'])
    const ticker = getRowValue(row, ['Ticker', 'Emisora', 'Simbolo', 'Símbolo', 'Symbol', 'Instrumento'])
    const tradeDate = getRowValue(row, ['Fecha Operacion', 'Fecha de Operacion', 'Trade Date', 'Operation Date', 'Fecha'])
    const operation = String(getRowValue(row, ['Operacion', 'Operación', 'Tipo', 'Movimiento', 'Side', 'Concepto']))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const quantity = parseMoney(getRowValue(row, ['Titulos', 'Títulos', 'Cantidad', 'Quantity']))
    const price = parseMoney(getRowValue(row, ['Precio', 'Price', 'Precio promedio', 'Precio de operacion']))
    const commission = Math.abs(parseMoney(getRowValue(row, ['Comision', 'Comisión', 'Commission', 'Arancel'])))
    const tax = Math.abs(parseMoney(getRowValue(row, ['Impuesto', 'ISR', 'Retencion', 'Retención', 'Tax'])))
    const savingsProduct = getRowValue(row, ['Producto', 'Producto ahorro', 'Cajita', 'Cuenta'])
    const nominalGat = getRowValue(row, ['GAT Nominal', 'GAT nominal', 'Ganancia Anual Total nominal'])
    const realGat = getRowValue(row, ['GAT Real', 'GAT real', 'Ganancia Anual Total real'])
    const subaccount = getRowValue(row, ['Subcuenta', 'Subcuenta afore', 'Cuenta individual'])
    const subaccountBalance = parseMoney(getRowValue(row, ['Saldo', 'Saldo subcuenta', 'Saldo final', 'Balance']))
    const retirementProduct = getRowValue(row, ['Producto retiro', 'Producto', 'AFORE'])
    if (date && !normalizeDate(date)) unparsedDates += 1
    if (/cajita|cuenta nu|sofipo/i.test(savingsProduct) || nominalGat || realGat) {
      savingsProductRows += 1
      if (/rendimiento|gat|interes/i.test(`${description} ${savingsProduct} ${nominalGat} ${realGat}`)) savingsYieldRows += 1
    }
    if (subaccount && (/afore|ppr|retiro/i.test(`${retirementProduct} ${subaccount}`) || getRowValue(row, ['Semanas cotizadas', 'SIEFORE']))) {
      retirementSubaccountRows += 1
      retirementSubaccountBalanceTotal += subaccountBalance
    }
    if (account && getRowValue(row, ['Fecha de Compra']) && getRowValue(row, ['Aparece en su Estado de Cuenta como'])) amexActivityRows += 1
    if (ticker && tradeDate && (quantity || price || amount)) {
      investmentOperationRows += 1
      if (/compra|buy/.test(operation)) investmentBuyRows += 1
      if (/venta|sell/.test(operation)) investmentSellRows += 1
      if (/dividendo|interes|rendimiento|cupon/.test(operation)) investmentIncomeRows += 1
      investmentCommissionsTotal += commission
      investmentTaxWithheld += tax
    }
    if (deposit || withdrawal || nature || getRowValue(row, ['Saldo', 'Saldo final'])) {
      bankMovementRows += 1
      if (deposit || /deposito|abono|credito|entrada|ingreso/.test(nature)) {
        bankDepositRows += 1
        bankDepositsTotal += Math.abs(deposit || amount)
      }
      if (withdrawal || /retiro|cargo|debito|salida|egreso/.test(nature)) {
        bankWithdrawalRows += 1
        bankWithdrawalsTotal += Math.abs(withdrawal || amount)
      }
    }
    return description && amount
  })
  return {
    rows: rows.length,
    errors: parsed.errors.length,
    unparsedDates,
    amexActivityRows,
    bankMovementRows,
    bankDepositRows,
    bankWithdrawalRows,
    bankDepositsTotal: Number(bankDepositsTotal.toFixed(2)),
    bankWithdrawalsTotal: Number(bankWithdrawalsTotal.toFixed(2)),
    bankNetCashFlow: Number((bankDepositsTotal - bankWithdrawalsTotal).toFixed(2)),
    investmentOperationRows,
    investmentBuyRows,
    investmentSellRows,
    investmentIncomeRows,
    investmentCommissionsTotal: Number(investmentCommissionsTotal.toFixed(2)),
    investmentTaxWithheld: Number(investmentTaxWithheld.toFixed(2)),
    savingsProductRows,
    savingsYieldRows,
    retirementSubaccountRows,
    retirementSubaccountBalanceTotal: Number(retirementSubaccountBalanceTotal.toFixed(2)),
  }
}

function attrsFor(text, localName) {
  const match = text.match(new RegExp(`<[\\w:.-]*${localName}\\s+([^>]+)>`))
  if (!match) return {}
  return Object.fromEntries([...match[1].matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)].map((row) => [row[1], row[2]]))
}

function countXmlTags(text, localName) {
  return [...text.matchAll(new RegExp(`<[\\w:.-]*${localName}(\\s|>|/)`, 'g'))].length
}

export function inspectXml(path) {
  const text = readFileSync(path, 'utf8')
  const comprobante = attrsFor(text, 'Comprobante')
  const nomina = attrsFor(text, 'Nomina')
  const total = parseMoney(comprobante.Total)
  const hasPayrollPeriod = Boolean(nomina.FechaInicialPago && nomina.FechaFinalPago && nomina.NumDiasPagados)
  const hasPayrollVersion = Boolean(nomina.Version)
  const hasPayrollReceiver = /<[\w:.-]*Receptor\b[^>]*(PeriodicidadPago|SalarioDiarioIntegrado|CuentaBancaria)=/i.test(text)
  const hasPayrollStamp = /<[\w:.-]*TimbreFiscalDigital\b[^>]*UUID=/i.test(text)
  const hasIsr = /TipoDeduccion="002"[^>]*Importe=|Concepto="ISR"/i.test(text)
  const hasImss = /TipoDeduccion="001"[^>]*Importe=|Concepto="IMSS"/i.test(text)
  const hasOtherPaymentDetail = /<[\w:.-]*OtroPago\b[^>]*Importe=/.test(text)
  return {
    hasPayroll: Boolean(nomina.Version || nomina.FechaPago),
    hasIncome: total > 0,
    hasPayrollPeriod,
    hasPayrollVersion,
    hasPayrollReceiver,
    hasPayrollStamp,
    hasIsr,
    hasImss,
    hasOtherPaymentDetail,
    percepciones: countXmlTags(text, 'Percepcion'),
    deducciones: countXmlTags(text, 'Deduccion'),
    otrosPagos: countXmlTags(text, 'OtroPago'),
  }
}

function pdfLayoutText(textContent) {
  const runs = (textContent.items ?? [])
    .map((item, index) => {
      if (!item || typeof item !== 'object' || !('str' in item)) return null
      const str = String(item.str ?? '').trim()
      const transform = Array.isArray(item.transform) ? item.transform : []
      if (!str) return null
      return {
        str,
        x: Number(transform[4] ?? 0),
        y: Number(transform[5] ?? 0),
        width: Number(item.width ?? 0),
        index,
      }
    })
    .filter(Boolean)
  const lines = []
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= 4)
    if (line) line.runs.push(run)
    else lines.push({ y: run.y, runs: [run] })
  }
  const layout = lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      [...line.runs]
        .sort((a, b) => a.x - b.x)
        .reduce((lineText, run, index, sorted) => {
          if (index === 0) return run.str
          const previous = sorted[index - 1]
          const gap = run.x - (previous.x + previous.width)
          return `${lineText}${gap > 32 ? '    ' : gap > 12 ? '  ' : ' '}${run.str}`
        }, ''),
    )
    .join('\n')
  const plain = [...runs].sort((a, b) => a.index - b.index).map((item) => item.str).join(' ')
  return { layout, plain, lineCount: lines.length, itemCount: runs.length }
}

export async function inspectPdf(path) {
  const bytes = new Uint8Array(readFileSync(path))
  const pdf = await getDocument({ data: bytes, disableWorker: true }).promise
  let chars = 0
  let textValue = ''
  let layoutLines = 0
  let textItems = 0
  const pageLimit = Math.min(pdf.numPages, 8)
  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const text = await page.getTextContent()
    const pageText = pdfLayoutText(text)
    layoutLines += pageText.lineCount
    textItems += pageText.itemCount
    textValue += `${pageText.layout || pageText.plain}\n`
    chars += pageText.plain.length
  }
  return {
    pages: pdf.numPages,
    pagesRead: pageLimit,
    charsInFirstPages: chars,
    layoutLines,
    textItems,
    paymentSignals: /pago\s+minimo|pago\s+para\s+no\s+generar|fecha\s+de\s+corte|cat/i.test(textValue),
    balanceSignals: /saldo\s+(final|actual)|l[ií]mite\s+de\s+cr[eé]dito/i.test(textValue),
    reconciliationSignals: /saldo\s+anterior|total\s+de\s+cargos|total\s+de\s+pagos|intereses|comisiones|\biva\b/i.test(textValue),
    cardPaymentScenarioSignals: (textValue.match(/escenarios?\s+de\s+pago|pago\s+m[ií]nimo\s*x[25]|meses\s*:\s*\d+|intereses\s*:\s*\$?[\d,.]+/gi) ?? []).length,
    speiSignals: /clave\s+de\s+rastreo|cuenta\s+beneficiaria|monto\s+del\s+pago|instituci[oó]n\s+(emisora|receptora)/i.test(textValue),
    savingsSignals: /cuenta\s+nu|cajitas?|gat\s+nominal|gat\s+real|fondo\s+de\s+protecci[oó]n|udis/i.test(textValue),
    yieldValiditySignals: /valores\s+calculados\s+el|vigencia\s+al/i.test(textValue),
    movementRowSignals:
      (textValue.match(/movimiento\s*:\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}[^|]+\|\s*descripcion\s*:/gi) ?? []).length +
      (textValue.match(/(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+[A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 .,&/+-]{3,90}?\s+\$?[\d,.]+\s+\$?[\d,.]+\s+\$?[\d,.]+/gi) ?? []).length,
    amountBalanceMovementSignals: (
      textValue.match(
        /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+[A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 .,&/+-]{3,90}?\s+\$?[\d,.]+\s+\$?[\d,.]+/gi,
      ) ?? []
    ).length,
    cardMovementSignals: (textValue.match(/(?:fecha\s+concepto\s+cargo\s+pago\s+credito|pago\s+recibido|bonificacion)/gi) ?? []).length,
    investmentSignals: /gbm|smart\s+cash|valor\s+del\s+portafolio|disponible\s+para\s+comprar|trading|acciones|etf/i.test(textValue),
    cetesSignals: /cetesdirecto|cetes|bonddia|enerfin|valores\s+gubernamentales|fecha\s+de\s+vencimiento|valor\s+al\s+vencimiento/i.test(textValue),
    pprSignals: /\bppr\b|plan\s+personal\s+para\s+el\s+retiro|aportaci[oó]n\s+deducible|fecha\s+objetivo\s+de\s+retiro/i.test(textValue),
    aforeSignals: /afore|consar|cuenta\s+individual|siefore|subcuenta|semanas\s+cotizadas/i.test(textValue),
    retirementSignals: /ahorro\s+para\s+el\s+retiro|saldo\s+(?:total\s+)?afore|saldo\s+de\s+retiro|ahorro\s+voluntario|aportaciones?\s+obligatorias?/i.test(textValue),
    positionSignals: /posici[oó]n\s*:|subcuenta\s*:[^|]+\|\s*saldo\s*:/i.test(textValue),
  }
}

export async function inspectImage(path) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(path)
    return {
      chars: data.text.length,
      confidence: Number((data.confidence / 100).toFixed(2)),
      merchantDetected: /TIENDA DEMO/i.test(data.text),
      totalDetected: /1250[.,]50/.test(data.text),
    }
  } finally {
    await worker.terminate()
  }
}

export async function inspectDocumentDirectory(sourceDir, { includeImages = true } = {}) {
  const files = supportedDocumentFiles(sourceDir)
  const result = {
    files: files.length,
    csv: {
      files: 0,
      rows: 0,
      errors: 0,
      unparsedDates: 0,
      amexActivityRows: 0,
      bankMovementRows: 0,
      bankDepositRows: 0,
      bankWithdrawalRows: 0,
      bankDepositsTotal: 0,
      bankWithdrawalsTotal: 0,
      bankNetCashFlow: 0,
      investmentOperationRows: 0,
      investmentBuyRows: 0,
      investmentSellRows: 0,
      investmentIncomeRows: 0,
      investmentCommissionsTotal: 0,
      investmentTaxWithheld: 0,
      savingsProductRows: 0,
      savingsYieldRows: 0,
      retirementSubaccountRows: 0,
      retirementSubaccountBalanceTotal: 0,
    },
    xml: {
      files: 0,
      payroll: 0,
      withIncome: 0,
      lines: 0,
      withPeriod: 0,
      withVersion: 0,
      withReceiver: 0,
      withStamp: 0,
      withIsr: 0,
      withImss: 0,
      withOtherPaymentDetail: 0,
    },
    pdf: {
      files: 0,
      readable: 0,
      pages: 0,
      pagesRead: 0,
      layoutLines: 0,
      textItems: 0,
      paymentSignals: 0,
      balanceSignals: 0,
      reconciliationSignals: 0,
      cardPaymentScenarioSignals: 0,
      speiSignals: 0,
      savingsSignals: 0,
      yieldValiditySignals: 0,
      movementRowSignals: 0,
      amountBalanceMovementSignals: 0,
      cardMovementSignals: 0,
      investmentSignals: 0,
      cetesSignals: 0,
      pprSignals: 0,
      aforeSignals: 0,
      retirementSignals: 0,
      positionSignals: 0,
    },
    image: { files: 0, ocrReady: 0, lowConfidence: 0 },
    ignoredBytes: 0,
  }

  for (const path of files) {
    const ext = extname(path).toLowerCase()
    if (ext === '.csv') {
      const inspected = inspectCsv(path)
      result.csv.files += 1
      result.csv.rows += inspected.rows
      result.csv.errors += inspected.errors
      result.csv.unparsedDates += inspected.unparsedDates
      result.csv.amexActivityRows += inspected.amexActivityRows
      result.csv.bankMovementRows += inspected.bankMovementRows
      result.csv.bankDepositRows += inspected.bankDepositRows
      result.csv.bankWithdrawalRows += inspected.bankWithdrawalRows
      result.csv.bankDepositsTotal = Number((result.csv.bankDepositsTotal + inspected.bankDepositsTotal).toFixed(2))
      result.csv.bankWithdrawalsTotal = Number((result.csv.bankWithdrawalsTotal + inspected.bankWithdrawalsTotal).toFixed(2))
      result.csv.bankNetCashFlow = Number((result.csv.bankDepositsTotal - result.csv.bankWithdrawalsTotal).toFixed(2))
      result.csv.investmentOperationRows += inspected.investmentOperationRows
      result.csv.investmentBuyRows += inspected.investmentBuyRows
      result.csv.investmentSellRows += inspected.investmentSellRows
      result.csv.investmentIncomeRows += inspected.investmentIncomeRows
      result.csv.investmentCommissionsTotal = Number((result.csv.investmentCommissionsTotal + inspected.investmentCommissionsTotal).toFixed(2))
      result.csv.investmentTaxWithheld = Number((result.csv.investmentTaxWithheld + inspected.investmentTaxWithheld).toFixed(2))
      result.csv.savingsProductRows += inspected.savingsProductRows
      result.csv.savingsYieldRows += inspected.savingsYieldRows
      result.csv.retirementSubaccountRows += inspected.retirementSubaccountRows
      result.csv.retirementSubaccountBalanceTotal = Number((result.csv.retirementSubaccountBalanceTotal + inspected.retirementSubaccountBalanceTotal).toFixed(2))
    } else if (ext === '.xml') {
      const inspected = inspectXml(path)
      result.xml.files += 1
      if (inspected.hasPayroll) result.xml.payroll += 1
      if (inspected.hasIncome) result.xml.withIncome += 1
      if (inspected.hasPayrollPeriod) result.xml.withPeriod += 1
      if (inspected.hasPayrollVersion) result.xml.withVersion += 1
      if (inspected.hasPayrollReceiver) result.xml.withReceiver += 1
      if (inspected.hasPayrollStamp) result.xml.withStamp += 1
      if (inspected.hasIsr) result.xml.withIsr += 1
      if (inspected.hasImss) result.xml.withImss += 1
      if (inspected.hasOtherPaymentDetail) result.xml.withOtherPaymentDetail += 1
      result.xml.lines += inspected.percepciones + inspected.deducciones + inspected.otrosPagos
    } else if (ext === '.pdf') {
      const inspected = await inspectPdf(path)
      result.pdf.files += 1
      if (inspected.charsInFirstPages > 0) result.pdf.readable += 1
      result.pdf.pagesRead += inspected.pagesRead
      result.pdf.layoutLines += inspected.layoutLines
      result.pdf.textItems += inspected.textItems
      if (inspected.paymentSignals) result.pdf.paymentSignals += 1
      if (inspected.balanceSignals) result.pdf.balanceSignals += 1
      if (inspected.reconciliationSignals) result.pdf.reconciliationSignals += 1
      result.pdf.cardPaymentScenarioSignals += inspected.cardPaymentScenarioSignals
      if (inspected.speiSignals) result.pdf.speiSignals += 1
      if (inspected.savingsSignals) result.pdf.savingsSignals += 1
      if (inspected.yieldValiditySignals) result.pdf.yieldValiditySignals += 1
      result.pdf.movementRowSignals += inspected.movementRowSignals
      result.pdf.amountBalanceMovementSignals += inspected.amountBalanceMovementSignals
      result.pdf.cardMovementSignals += inspected.cardMovementSignals
      if (inspected.investmentSignals) result.pdf.investmentSignals += 1
      if (inspected.cetesSignals) result.pdf.cetesSignals += 1
      if (inspected.pprSignals) result.pdf.pprSignals += 1
      if (inspected.aforeSignals) result.pdf.aforeSignals += 1
      if (inspected.retirementSignals) result.pdf.retirementSignals += 1
      if (inspected.positionSignals) result.pdf.positionSignals += 1
      result.pdf.pages += inspected.pages
    } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext) && includeImages) {
      const inspected = await inspectImage(path)
      result.image.files += 1
      if (inspected.merchantDetected && inspected.totalDetected) result.image.ocrReady += 1
      if (inspected.confidence < 0.65) result.image.lowConfidence += 1
    } else {
      result.ignoredBytes += statSync(path).size
    }
  }

  return result
}
