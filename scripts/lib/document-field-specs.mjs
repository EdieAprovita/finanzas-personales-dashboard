export const documentKindLabels = {
  credit_card_statement: 'Tarjetas de credito',
  payroll_cfdi: 'Nomina CFDI',
  bank_statement: 'Bancos y ahorro',
  investment_statement: 'Inversiones',
  invoice_cfdi: 'Facturas CFDI',
  purchase_receipt: 'Tickets y recibos',
  unknown: 'Por clasificar',
}

const fieldLabelByKey = {
  accountLast4: 'terminacion cuenta',
  aforeName: 'AFORE',
  annualYieldPercent: 'tasa anual',
  availableCredit: 'credito disponible',
  availableToInvest: 'disponible invertir',
  availableToWithdraw: 'disponible retirar',
  bankReconciliationStatus: 'conciliacion banco',
  cardMovementRows: 'movimientos tarjeta',
  cardPaymentScenarios: 'escenarios pago',
  cardReconciliationStatus: 'conciliacion tarjeta',
  cashBalance: 'efectivo',
  closingBalance: 'saldo final',
  commissionsAmount: 'comisiones',
  creditLimit: 'limite credito',
  currency: 'moneda',
  currencies: 'monedas',
  cutoffDate: 'fecha de corte',
  currentBalance: 'saldo actual',
  dailyLiquidity: 'liquidez diaria',
  dailyReturn: 'rendimiento diario',
  date: 'fecha',
  detectedInstruments: 'instrumentos',
  deductionConcepts: 'detalle deducciones',
  depositsTotal: 'depositos',
  dueDate: 'fecha limite',
  employerName: 'emisor nomina',
  employerRegistrationSuffix: 'registro patronal',
  employmentSubsidyAmount: 'subsidio empleo',
  financialCostsTotal: 'costo financiero',
  instrumentType: 'instrumento',
  investmentBuyRows: 'compras inversion',
  investmentCashFlow: 'flujo inversion',
  investmentIncomeRows: 'ingresos inversion',
  investmentOperationRowCount: 'conteo operaciones',
  investmentOperationRows: 'operaciones',
  investmentProduct: 'producto inversion',
  investmentSellRows: 'ventas inversion',
  issuerName: 'emisor',
  isrWithheld: 'ISR retenido',
  iva: 'IVA',
  liquidity: 'liquidez',
  liquidityRestriction: 'restriccion liquidez',
  longTermLiquidity: 'liquidez largo plazo',
  mandatoryContributions: 'aportaciones obligatorias',
  market: 'mercado',
  maturityDate: 'vencimiento',
  maturityValue: 'valor vencimiento',
  merchant: 'comercio',
  minimumPayment: 'pago minimo',
  minimumPaymentWithDeferred: 'minimo + diferidos',
  monthlyContribution: 'aportacion mensual',
  netCashFlow: 'flujo neto',
  netIncome: 'ingreso neto',
  netReturnIndicator: 'rendimiento neto',
  newCharges: 'cargos nuevos',
  noInterestPayment: 'pago no intereses',
  nominalGatPercent: 'GAT nominal',
  nominalValue: 'valor nominal',
  openingBalance: 'saldo inicial',
  ordinaryAnnualRate: 'tasa ordinaria',
  otherPaymentConcepts: 'detalle otros pagos',
  paidDays: 'dias pagados',
  paymentDate: 'fecha pago',
  paymentsAmount: 'pagos',
  periodEnd: 'periodo final',
  periodReturn: 'rendimiento',
  periodStart: 'periodo inicial',
  payrollComplementVersion: 'version nomina',
  payrollPeriodicity: 'periodicidad',
  payrollType: 'tipo nomina',
  perceptionConcepts: 'detalle percepciones',
  portfolioValue: 'valor portafolio',
  positionRows: 'detalle posiciones',
  positions: 'posiciones',
  positionsMarketValue: 'valor posiciones',
  previousBalance: 'saldo anterior',
  protectionLimitUdis: 'proteccion UDIS',
  realGatPercent: 'GAT real',
  receiverName: 'receptor',
  retirementBalance: 'saldo retiro',
  retirementProduct: 'producto retiro',
  riskLevel: 'riesgo',
  savingsProduct: 'producto ahorro',
  settlementWindow: 'liquidacion',
  siefore: 'SIEFORE',
  speiBeneficiaryAccountLast4: 'cuenta destino SPEI',
  speiPaymentAmount: 'monto SPEI',
  speiTraceKey: 'clave SPEI',
  statementMovementRows: 'movimientos visibles',
  subaccountBalanceTotal: 'saldo total subcuentas',
  subaccountPositions: 'posiciones subcuenta',
  subaccountRows: 'detalle subcuentas',
  subaccounts: 'subcuentas',
  subtotal: 'subtotal',
  taxDeductibleAmount: 'monto deducible',
  taxWithheld: 'impuesto retenido',
  termDays: 'plazo dias',
  tickers: 'tickers',
  titleCount: 'titulos',
  total: 'total',
  totalDeducciones: 'deducciones',
  totalDeductions: 'deducciones',
  totalOtrosPagos: 'otros pagos',
  totalPercepciones: 'percepciones',
  tradedAmount: 'importe operado',
  uuid: 'UUID',
  voluntaryContributions: 'aportaciones voluntarias',
  weeksContributed: 'semanas cotizadas',
  withdrawalRestriction: 'restriccion retiro',
  withdrawalsTotal: 'retiros',
  yieldCalculationDate: 'fecha calculo rendimiento',
  yieldValidUntil: 'vigencia rendimiento',
}

function fields(keys) {
  return keys.map((key) => ({ key, label: fieldLabelByKey[key] ?? key }))
}

function populated(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

export function documentFieldLabel(key) {
  return fieldLabelByKey[key] ?? key
}

export function documentSubtypeForExtracted(kind, extracted = {}) {
  if (kind === 'credit_card_statement') {
    if (populated(extracted.cardPaymentScenarios)) return { key: 'credit_card_statement.payment_scenarios', label: 'Tarjeta con escenarios' }
    if (populated(extracted.cardMovementRows)) return { key: 'credit_card_statement.movement_review', label: 'Tarjeta con movimientos' }
    return { key: 'credit_card_statement.statement', label: 'Estado de tarjeta' }
  }

  if (kind === 'bank_statement') {
    if (populated(extracted.speiDetected)) return { key: 'bank_statement.spei', label: 'SPEI / transferencia' }
    if (populated(extracted.savingsProduct)) return { key: 'bank_statement.savings_product', label: String(extracted.savingsProduct) }
    if (populated(extracted.payrollAccountMixedFlow) || populated(extracted.payrollDepositRows)) return { key: 'bank_statement.payroll_account', label: 'Cuenta nomina mixta' }
    if (populated(extracted.statementMovementRows)) return { key: 'bank_statement.movement_review', label: 'Banco con movimientos' }
    return { key: 'bank_statement.statement', label: 'Estado bancario' }
  }

  if (kind === 'payroll_cfdi') {
    if (populated(extracted.payrollComplementVersion) || populated(extracted.totalPercepciones) || populated(extracted.totalDeducciones)) {
      return { key: 'payroll_cfdi.xml_cfdi', label: 'CFDI nomina XML' }
    }
    if (populated(extracted.isrDetected) || populated(extracted.imssDetected) || populated(extracted.totalDeductions)) return { key: 'payroll_cfdi.ocr_pdf', label: 'Nomina OCR/PDF' }
    return { key: 'payroll_cfdi.payroll', label: 'Nomina' }
  }

  if (kind === 'investment_statement') {
    if (extracted.retirementProduct === 'PPR') return { key: 'investment_statement.ppr', label: 'PPR' }
    if (extracted.retirementProduct === 'AFORE') return { key: 'investment_statement.afore', label: 'AFORE' }
    if (extracted.investmentProduct === 'Cetesdirecto') return { key: 'investment_statement.cetesdirecto', label: 'Cetesdirecto' }
    if (extracted.investmentProduct === 'GBM Smart Cash') return { key: 'investment_statement.gbm_smart_cash', label: 'GBM Smart Cash' }
    if (populated(extracted.investmentOperationRows)) return { key: 'investment_statement.brokerage_operations', label: 'Operaciones GBM' }
    if (populated(extracted.investmentProduct)) return { key: 'investment_statement.brokerage_portfolio', label: String(extracted.investmentProduct) }
    return { key: 'investment_statement.investment', label: 'Inversion' }
  }

  if (kind === 'invoice_cfdi') return { key: 'invoice_cfdi.fiscal_invoice', label: 'Factura CFDI' }
  if (kind === 'purchase_receipt') return { key: 'purchase_receipt.receipt', label: 'Recibo / ticket' }
  return { key: 'unknown.unclassified', label: 'Sin clasificar' }
}

export function expectedFieldSpecsForExtracted(kind, extracted = {}) {
  if (kind === 'credit_card_statement') {
    return fields([
      'cutoffDate',
      'dueDate',
      'minimumPayment',
      'noInterestPayment',
      'currentBalance',
      'creditLimit',
      'previousBalance',
      'newCharges',
      'paymentsAmount',
      ...(populated(extracted.cardMovementRows) ? ['cardMovementRows'] : []),
      ...(populated(extracted.cardPaymentScenarios) ? ['cardPaymentScenarios'] : []),
      ...(populated(extracted.financialCostsTotal) ? ['financialCostsTotal'] : []),
      'cardReconciliationStatus',
    ])
  }

  if (kind === 'bank_statement') {
    if (populated(extracted.savingsProduct)) {
      return fields([
        'periodStart',
        'periodEnd',
        'closingBalance',
        'depositsTotal',
        'withdrawalsTotal',
        'savingsProduct',
        'annualYieldPercent',
        'nominalGatPercent',
        'realGatPercent',
        'yieldValidUntil',
        'protectionLimitUdis',
        ...(populated(extracted.yieldCalculationDate) ? ['yieldCalculationDate'] : []),
        ...(populated(extracted.speiDetected) ? ['speiTraceKey', 'speiBeneficiaryAccountLast4', 'speiPaymentAmount'] : []),
      ])
    }
    return fields([
      'periodStart',
      'periodEnd',
      ...(populated(extracted.openingBalance) ? ['openingBalance'] : []),
      'closingBalance',
      'depositsTotal',
      'withdrawalsTotal',
      ...(populated(extracted.netCashFlow) ? ['netCashFlow'] : []),
      ...(populated(extracted.statementMovementRows) ? ['statementMovementRows'] : []),
      ...(populated(extracted.bankReconciliationStatus) ? ['bankReconciliationStatus'] : []),
      ...(populated(extracted.speiDetected) ? ['speiTraceKey', 'speiBeneficiaryAccountLast4', 'speiPaymentAmount'] : []),
      ...(populated(extracted.savingsProduct) ? ['savingsProduct'] : []),
      ...(populated(extracted.annualYieldPercent) ? ['annualYieldPercent'] : []),
      ...(populated(extracted.nominalGatPercent) ? ['nominalGatPercent', 'realGatPercent', 'yieldCalculationDate', 'yieldValidUntil'] : []),
    ])
  }

  if (kind === 'payroll_cfdi') {
    if (populated(extracted.payrollComplementVersion) || populated(extracted.totalPercepciones) || populated(extracted.totalDeducciones)) {
      return fields([
        'paymentDate',
        'periodStart',
        'periodEnd',
        'payrollType',
        'payrollComplementVersion',
        'payrollPeriodicity',
        'paidDays',
        'employerName',
        'netIncome',
        'totalPercepciones',
        'totalDeducciones',
        'perceptionConcepts',
        'deductionConcepts',
      ])
    }
    return fields(['paymentDate', 'periodStart', 'periodEnd', 'employerName', 'netIncome', 'totalDeductions'])
  }

  if (kind === 'investment_statement') {
    if (extracted.retirementProduct === 'PPR') {
      return fields([
        'retirementProduct',
        'retirementBalance',
        'monthlyContribution',
        'taxDeductibleAmount',
        'targetRetirementDate',
        'positions',
        'withdrawalRestriction',
        'liquidityRestriction',
      ])
    }
    if (extracted.retirementProduct === 'AFORE') {
      return fields([
        'retirementProduct',
        'retirementBalance',
        'voluntaryContributions',
        'mandatoryContributions',
        'periodReturn',
        'subaccounts',
        'subaccountPositions',
        'subaccountRows',
        'subaccountBalanceTotal',
        'longTermLiquidity',
        'weeksContributed',
        'aforeName',
        'siefore',
        'netReturnIndicator',
      ])
    }
    if (extracted.investmentProduct === 'Cetesdirecto') {
      return fields([
        'investmentProduct',
        'portfolioValue',
        'instrumentType',
        'titleCount',
        'purchaseDate',
        'maturityDate',
        'termDays',
        'nominalValue',
        'marketValue',
        'maturityValue',
        'annualYieldPercent',
        'positions',
        'detectedInstruments',
        'settlementWindow',
      ])
    }
    if (populated(extracted.investmentOperationRows)) {
      return fields([
        'investmentOperationRows',
        'investmentOperationRowCount',
        'tickers',
        'tradedAmount',
        'commissionsAmount',
        'taxWithheld',
        'investmentCashFlow',
        'currencies',
        ...(populated(extracted.investmentBuyRows) ? ['investmentBuyRows'] : []),
        ...(populated(extracted.investmentSellRows) ? ['investmentSellRows'] : []),
        ...(populated(extracted.investmentIncomeRows) ? ['investmentIncomeRows'] : []),
      ])
    }
    return fields([
      'investmentProduct',
      'portfolioValue',
      'cashBalance',
      'availableToInvest',
      'periodReturn',
      'annualYieldPercent',
      'positions',
      'detectedInstruments',
      'currency',
      'liquidity',
      ...(populated(extracted.settlementWindow) ? ['settlementWindow'] : []),
    ])
  }

  if (kind === 'invoice_cfdi') return fields(['uuid', 'issuerName', 'receiverName', 'subtotal', 'iva', 'total'])
  if (kind === 'purchase_receipt') return fields(['merchant', 'date', 'total', 'iva'])
  return []
}

export function expectedFieldKeysForExtracted(kind, extracted = {}) {
  return expectedFieldSpecsForExtracted(kind, extracted).map((field) => field.key)
}
