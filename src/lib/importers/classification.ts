import type { DocumentKind } from '../../domain/types'
import { normalizeForSearch } from './normalization'

export function inferInstitution(fileName: string, text = '') {
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

export function classifyDocument(file: File, text = '', preferredKind?: DocumentKind) {
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
