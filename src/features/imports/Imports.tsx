import { AlertTriangle, ArrowDownToLine, CheckCircle2, FileText, Gauge, Plus, Upload } from 'lucide-react'
import type { FinancialProfile, ImportedDocument } from '../../domain/types'
import { documentKindLabels } from '../../lib/documentFieldSpecs'
import { profileDisplayName } from '../profiles/profileSummary'
import { documentImportAccept } from './documentImportConfig'
import { analyzeDocumentQuality, documentQualitySummary, documentReviewActions } from './documentQuality'

const extractedFieldLabels: Record<string, string> = {
  accountType: 'Cuenta',
  accountLast4: 'Terminacion',
  amount: 'Importe',
  ambiguousDirectionRows: 'Filas sin direccion',
  annualYieldPercent: 'Rendimiento anual',
  appliedRows: 'Movimientos aplicados',
  aforeDetected: 'AFORE detectado',
  aforeName: 'AFORE',
  availableCredit: 'Credito disponible',
  availableToInvest: 'Disponible invertir',
  availableToWithdraw: 'Disponible retirar',
  balance: 'Saldo',
  balancePendingReview: 'Saldo por revisar',
  balanceDetected: 'Saldo detectado',
  balanceDeltaDepositRows: 'Depositos por saldo',
  balanceDeltaInferredRows: 'Inferidos por saldo',
  balanceDeltaWithdrawalRows: 'Retiros por saldo',
  bankBalanceDifference: 'Diferencia banco',
  bankReconciliationStatus: 'Conciliacion banco',
  baseContributionSalary: 'SBC',
  cashBalance: 'Efectivo',
  catPercent: 'CAT',
  closingBalance: 'Saldo final',
  credit: 'Credito',
  creditLimit: 'Limite credito',
  currentBalance: 'Saldo actual',
  cutoffDate: 'Fecha corte',
  date: 'Fecha',
  dedupeReason: 'Razon dedupe',
  detectedFields: 'Campos detectados',
  detectedInstruments: 'Instrumentos',
  deposit: 'Deposito',
  depositRows: 'Mov. deposito',
  depositsTotal: 'Depositos',
  debtPaymentRows: 'Pagos deuda',
  debtPaymentTotal: 'Total pagos deuda',
  deferredAmortization: 'Diferidos del periodo',
  deferredDetected: 'Diferidos',
  description: 'Descripcion',
  dueDate: 'Fecha limite',
  employerName: 'Emisor nomina',
  expectedClosingBalance: 'Saldo final esperado',
  expectedFields: 'Campos esperados',
  expenseRows: 'Mov. gasto',
  expenseTotal: 'Total gastos',
  employeeCurpSuffix: 'CURP terminacion',
  employeeNssSuffix: 'NSS terminacion',
  employeeNumberSuffix: 'Empleado terminacion',
  employeeRfcSuffix: 'RFC receptor',
  employerRfcSuffix: 'RFC emisor',
  employerRegistrationSuffix: 'Registro patronal',
  employmentRegime: 'Regimen',
  employmentSubsidyAmount: 'Subsidio empleo',
  bankCode: 'Banco',
  cardReconciliationDifference: 'Diferencia conciliacion',
  cardReconciliationExpectedBalance: 'Saldo esperado',
  cardReconciliationMissing: 'Faltan para conciliar',
  cardReconciliationSeverity: 'Riesgo conciliacion',
  cardReconciliationStatus: 'Conciliacion tarjeta',
  cardReconciliationTolerance: 'Tolerancia',
  cardChargesRows: 'Mov. cargo tarjeta',
  cardChargesTotal: 'Cargos visibles',
  cardCreditsRows: 'Mov. credito tarjeta',
  cardCreditsTotal: 'Creditos visibles',
  cardMovementRowCount: 'Movimientos tarjeta',
  cardMovementRows: 'Detalle tarjeta',
  cardNetActivity: 'Actividad neta tarjeta',
  cardPaymentsRows: 'Mov. pago tarjeta',
  cardPaymentsTotal: 'Pagos visibles',
  cardLowestEstimatedInterest: 'Menor interes estimado',
  cardLowestInterestScenario: 'Mejor escenario',
  cardMaxInterestSavings: 'Ahorro maximo interes',
  cardPaymentScenarioRows: 'Escenarios pago',
  cardPaymentScenarios: 'Escenarios detalle',
  charge: 'Cargo',
  compensatedBalance: 'Saldo favor',
  contractType: 'Contrato',
  conflictingAmountRows: 'Filas ambiguas',
  contributions: 'Aportaciones',
  deductionConcepts: 'Deducciones detalle',
  dailyIntegratedSalary: 'SDI',
  dailyReturn: 'Rendimiento diario',
  feesAmount: 'Comisiones',
  financialCostsTotal: 'Costo financiero',
  frozenSavingsDetected: 'Ahorro congelado',
  frozenTermDays: 'Plazo congelado',
  grossPay: 'Percepciones',
  imssDetected: 'IMSS',
  infonavitDetected: 'INFONAVIT',
  interestAmount: 'Intereses',
  incomeRows: 'Mov. ingreso',
  incomeTotal: 'Total ingresos',
  instrumentCount: 'Instrumentos detectados',
  investmentProduct: 'Producto inversion',
  investmentWithdrawalsTotal: 'Retiros inversion',
  isrDetected: 'ISR',
  isrWithheld: 'ISR retenido',
  iva: 'IVA',
  issuerName: 'Emisor',
  liquidity: 'Liquidez',
  matchedTransactionIds: 'Movimientos relacionados',
  merchant: 'Comercio',
  movementType: 'Tipo movimiento',
  name: 'Nombre',
  minimumPayment: 'Pago minimo',
  minimumPaymentWithDeferred: 'Minimo + diferidos',
  missingFields: 'Campos faltantes',
  netCashFlow: 'Flujo neto',
  netIncome: 'Ingreso neto',
  newCharges: 'Cargos',
  nominalGatPercent: 'GAT nominal',
  noInterestPayment: 'Pago no intereses',
  ocrConfidence: 'Confianza OCR',
  openingBalance: 'Saldo inicial',
  ordinaryAnnualRate: 'Tasa anual',
  otherPaymentConcepts: 'Otros pagos detalle',
  payment: 'Pago',
  paymentsAmount: 'Pagos',
  paymentDate: 'Fecha pago',
  estimatedInterest: 'Interes estimado',
  estimatedTotalCost: 'Costo total estimado',
  paidDays: 'Dias pagados',
  pagesWithLayoutText: 'Paginas con texto',
  pagesWithOcrText: 'Paginas OCR',
  payrollAccountDepositRows: 'Depositos cuenta nomina',
  payrollAccountMixedFlow: 'Cuenta nomina mixta',
  payrollAccountWithdrawalRows: 'Retiros cuenta nomina',
  payrollComplementVersion: 'Version nomina',
  payrollDepositRows: 'Depositos nomina',
  payrollDepositTotal: 'Total nomina',
  payrollPeriodicity: 'Periodicidad',
  periodYield: 'Rendimiento periodo',
  payrollType: 'Tipo nomina',
  payrollUuidSuffix: 'UUID terminacion',
  periodEnd: 'Fin periodo',
  periodReturn: 'Rendimiento',
  periodStart: 'Inicio periodo',
  pdfTextMode: 'Lectura PDF',
  pdfTextPagesRead: 'Paginas leidas',
  portfolioValue: 'Valor portafolio',
  positionRows: 'Posiciones',
  positions: 'Detalle posiciones',
  positionsMarketValue: 'Valor posiciones',
  price: 'Precio',
  perceptionConcepts: 'Percepciones detalle',
  previousBalance: 'Saldo anterior',
  quantity: 'Cantidad',
  qualityScore: 'Calidad',
  receiverName: 'Receptor',
  realGatPercent: 'GAT real',
  reviewedMovementRowsApplied: 'Movimientos PDF aplicados',
  reviewedMovementRowsAppliedAt: 'PDF aplicado',
  reviewedMovementRowsApproval: 'Aprobacion PDF',
  rows: 'Filas',
  savingsProduct: 'Producto ahorro',
  skippedDuplicateRows: 'Duplicados omitidos',
  skippedRows: 'Filas omitidas',
  skippedSemanticDuplicates: 'Nomina no duplicada',
  settlementWindow: 'Liquidacion',
  scenarioName: 'Escenario',
  speiDetected: 'SPEI detectado',
  speiBeneficiaryAccountLast4: 'Cuenta beneficiaria',
  speiIssuerInstitution: 'Banco emisor SPEI',
  speiPaymentAmount: 'Monto SPEI',
  speiReceiverInstitution: 'Banco receptor SPEI',
  speiReferenceNumber: 'Referencia SPEI',
  speiTraceKey: 'Clave rastreo',
  statementDate: 'Fecha estado',
  statementMovementDepositRows: 'Depositos visibles',
  statementMovementDepositsTotal: 'Depositos PDF',
  statementMovementNetCashFlow: 'Flujo visible PDF',
  statementMovementRowCount: 'Movimientos visibles',
  statementMovementRows: 'Detalle movimientos',
  statementMovementWithdrawalRows: 'Retiros visibles',
  statementMovementWithdrawalsTotal: 'Retiros PDF',
  subtotal: 'Subtotal',
  textPreview: 'Texto OCR',
  textLength: 'Texto',
  total: 'Total',
  totalDeducciones: 'Deducciones',
  totalDebtBalance: 'Saldo deudor',
  totalOtrosPagos: 'Otros pagos',
  totalPercepciones: 'Percepciones',
  totalPerceptionsExempt: 'Exento',
  totalPerceptionsTaxable: 'Gravado',
  totalDeductions: 'Deducciones',
  totalOtherDeductions: 'Otras deducciones',
  totalOtherPayments: 'Otros pagos',
  totalSalaries: 'Sueldos',
  totalTaxesWithheld: 'Impuestos retenidos',
  taxWithheld: 'Impuesto retenido',
  imssWithheld: 'IMSS retenido',
  infonavitWithheld: 'INFONAVIT',
  investmentBuyRows: 'Compras inversion',
  investmentCashFlow: 'Flujo inversion',
  investmentFeeRows: 'Comisiones inversion',
  investmentIncomeRows: 'Ingresos inversion',
  investmentOperationRowCount: 'Operaciones inversion',
  investmentOperationRows: 'Detalle operaciones',
  investmentSellRows: 'Ventas inversion',
  markets: 'Mercados',
  tickers: 'Tickers',
  tradedAmount: 'Importe operado',
  workdayType: 'Jornada',
  yieldCalculationDate: 'Calculo rendimiento',
  yieldValidUntil: 'Vigencia rendimiento',
  riskPosition: 'Riesgo puesto',
  federalEntity: 'Entidad',
  unparsedDates: 'Fechas no leidas',
  vatAmount: 'IVA',
  transferRows: 'Transferencias',
  transferInTotal: 'Transferencias entrada',
  transferOutTotal: 'Transferencias salida',
  withdrawalRows: 'Mov. retiro',
  withdrawal: 'Retiro',
  withdrawals: 'Retiros',
  withdrawalsTotal: 'Retiros',
  commissionsAmount: 'Comisiones inversion',
  contributionsTotal: 'Aportaciones',
  curpSuffix: 'CURP terminacion',
  market: 'Mercado',
  minimumAmount: 'Monto minimo',
  monthlyContribution: 'Aportacion mensual',
  monthlyDepositLimitUdis: 'Limite mensual UDIs',
  mandatoryContributions: 'Aport. obligatorias',
  maturityDate: 'Vencimiento',
  maturityValue: 'Valor vencimiento',
  marketValue: 'Valor mercado',
  netReturnIndicator: 'Rendimiento neto',
  nativeTextItems: 'Items texto PDF',
  nominalValue: 'Valor nominal',
  nonDeductibleContributions: 'Aport. no deducibles',
  protectionLimitUdis: 'Proteccion UDIs',
  purchaseDate: 'Fecha compra',
  unrealizedGain: 'Ganancia no realizada',
  employerContributions: 'Aport. patronales',
  fundName: 'Fondo',
  governmentContributions: 'Aport. gobierno',
  instrumentType: 'Instrumento',
  liquidityRestriction: 'Restriccion liquidez',
  longTermLiquidity: 'Liquidez largo plazo',
  nssSuffix: 'NSS terminacion',
  retirementBalance: 'Saldo retiro',
  retirementProduct: 'Producto retiro',
  retirementWithdrawals: 'Retiros retiro',
  riskLevel: 'Riesgo',
  siefore: 'SIEFORE',
  subaccounts: 'Subcuentas',
  subaccountBalanceTotal: 'Saldo subcuentas',
  subaccountPositions: 'Detalle subcuentas',
  subaccountRows: 'Subcuentas detalle',
  targetRetirementDate: 'Fecha objetivo retiro',
  taxDeductibleAmount: 'Deducible',
  termDays: 'Plazo dias',
  titleCount: 'Titulos',
  voluntaryContributions: 'Aport. voluntarias',
  weeksContributed: 'Semanas cotizadas',
  withdrawalRestriction: 'Restriccion retiro',
}

const moneyFields = new Set([
  'amount',
  'availableCredit',
  'availableToInvest',
  'availableToWithdraw',
  'bankBalanceDifference',
  'balance',
  'baseContributionSalary',
  'cashBalance',
  'cardReconciliationDifference',
  'cardReconciliationExpectedBalance',
  'cardReconciliationTolerance',
  'cardChargesTotal',
  'cardCreditsTotal',
  'cardNetActivity',
  'cardPaymentsTotal',
  'charge',
  'closingBalance',
  'credit',
  'creditLimit',
  'currentBalance',
  'debtPaymentTotal',
  'deferredAmortization',
  'deposit',
  'depositsTotal',
  'dailyIntegratedSalary',
  'dailyReturn',
  'employmentSubsidyAmount',
  'compensatedBalance',
  'commissionsAmount',
  'contributions',
  'contributionsTotal',
  'employerContributions',
  'expectedClosingBalance',
  'expenseTotal',
  'feesAmount',
  'financialCostsTotal',
  'grossPay',
  'governmentContributions',
  'imssWithheld',
  'infonavitWithheld',
  'interestAmount',
  'estimatedInterest',
  'estimatedTotalCost',
  'incomeTotal',
  'investmentWithdrawalsTotal',
  'isrWithheld',
  'minimumPayment',
  'minimumPaymentWithDeferred',
  'minimumAmount',
  'monthlyPayment',
  'monthlyContribution',
  'mandatoryContributions',
  'maturityValue',
  'marketValue',
  'netCashFlow',
  'netIncome',
  'newCharges',
  'noInterestPayment',
  'cardLowestEstimatedInterest',
  'cardMaxInterestSavings',
  'nominalValue',
  'nonDeductibleContributions',
  'openingBalance',
  'paymentsAmount',
  'payment',
  'payrollDepositTotal',
  'periodYield',
  'periodReturn',
  'portfolioValue',
  'positionsMarketValue',
  'price',
  'previousBalance',
  'purchaseValue',
  'retirementBalance',
  'retirementWithdrawals',
  'speiPaymentAmount',
  'statementMovementDepositsTotal',
  'statementMovementNetCashFlow',
  'statementMovementWithdrawalsTotal',
  'subaccountBalanceTotal',
  'subtotal',
  'total',
  'totalDebtBalance',
  'totalDeducciones',
  'totalDeductions',
  'totalOtrosPagos',
  'totalOtherPayments',
  'totalPercepciones',
  'totalPerceptionsExempt',
  'totalPerceptionsTaxable',
  'vatAmount',
  'totalOtherDeductions',
  'totalSalaries',
  'totalTaxesWithheld',
  'taxWithheld',
  'taxDeductibleAmount',
  'transferInTotal',
  'transferOutTotal',
  'withdrawal',
  'withdrawalsTotal',
  'withdrawals',
  'unrealizedGain',
  'voluntaryContributions',
])

const percentFields = new Set([
  'annualYieldPercent',
  'catPercent',
  'netReturnIndicator',
  'nominalGatPercent',
  'ocrConfidence',
  'ordinaryAnnualRate',
  'qualityScore',
  'realGatPercent',
])

const extractedFieldPriority: Record<string, string[]> = {
  payroll_cfdi: [
    'paymentDate',
    'periodStart',
    'periodEnd',
    'netIncome',
    'totalPercepciones',
    'totalDeducciones',
    'totalOtrosPagos',
    'isrWithheld',
    'imssWithheld',
    'infonavitWithheld',
    'payrollType',
    'payrollComplementVersion',
    'payrollPeriodicity',
    'paidDays',
    'employeeRfcSuffix',
    'employeeCurpSuffix',
    'payrollUuidSuffix',
    'appliedRows',
    'skippedSemanticDuplicates',
    'matchedTransactionIds',
    'grossPay',
    'totalDeductions',
    'isrDetected',
    'imssDetected',
    'infonavitDetected',
    'qualityScore',
    'missingFields',
  ],
  credit_card_statement: [
    'pdfTextMode',
    'pdfTextPagesRead',
    'cutoffDate',
    'dueDate',
    'minimumPayment',
    'minimumPaymentWithDeferred',
    'noInterestPayment',
    'cardPaymentScenarioRows',
    'cardLowestInterestScenario',
    'cardLowestEstimatedInterest',
    'cardMaxInterestSavings',
    'currentBalance',
    'cardReconciliationStatus',
    'cardReconciliationDifference',
    'cardReconciliationExpectedBalance',
    'creditLimit',
    'availableCredit',
    'previousBalance',
    'newCharges',
    'deferredAmortization',
    'paymentsAmount',
    'cardMovementRowCount',
    'cardChargesTotal',
    'cardPaymentsTotal',
    'cardCreditsTotal',
    'cardNetActivity',
    'financialCostsTotal',
    'interestAmount',
    'feesAmount',
    'vatAmount',
    'catPercent',
    'pagesWithLayoutText',
    'pagesWithOcrText',
    'qualityScore',
    'missingFields',
  ],
  bank_statement: [
    'pdfTextMode',
    'pdfTextPagesRead',
    'closingBalance',
    'savingsProduct',
    'annualYieldPercent',
    'nominalGatPercent',
    'realGatPercent',
    'bankReconciliationStatus',
    'depositsTotal',
    'withdrawalsTotal',
    'netCashFlow',
    'statementMovementRowCount',
    'payrollDepositRows',
    'payrollAccountMixedFlow',
    'payrollAccountDepositRows',
    'payrollAccountWithdrawalRows',
    'payrollDepositTotal',
    'depositRows',
    'withdrawalRows',
    'balanceDeltaInferredRows',
    'balanceDeltaDepositRows',
    'balanceDeltaWithdrawalRows',
    'ambiguousDirectionRows',
    'debtPaymentRows',
    'transferRows',
    'incomeRows',
    'expenseRows',
    'openingBalance',
    'expectedClosingBalance',
    'bankBalanceDifference',
    'appliedRows',
    'skippedSemanticDuplicates',
    'periodYield',
    'frozenTermDays',
    'yieldCalculationDate',
    'yieldValidUntil',
    'protectionLimitUdis',
    'speiDetected',
    'speiTraceKey',
    'speiPaymentAmount',
    'speiBeneficiaryAccountLast4',
    'pagesWithLayoutText',
    'pagesWithOcrText',
    'qualityScore',
    'missingFields',
  ],
  investment_statement: [
    'investmentProduct',
    'retirementProduct',
    'portfolioValue',
    'retirementBalance',
    'instrumentType',
    'maturityDate',
    'termDays',
    'titleCount',
    'positionRows',
    'positionsMarketValue',
    'maturityValue',
    'marketValue',
    'availableToWithdraw',
    'cashBalance',
    'availableToInvest',
    'investmentOperationRowCount',
    'tradedAmount',
    'investmentCashFlow',
    'investmentBuyRows',
    'investmentSellRows',
    'tickers',
    'periodReturn',
    'dailyReturn',
    'annualYieldPercent',
    'netReturnIndicator',
    'subaccounts',
    'subaccountRows',
    'subaccountBalanceTotal',
    'siefore',
    'weeksContributed',
    'voluntaryContributions',
    'mandatoryContributions',
    'employerContributions',
    'governmentContributions',
    'retirementWithdrawals',
    'monthlyContribution',
    'taxDeductibleAmount',
    'currency',
    'market',
    'liquidity',
    'settlementWindow',
    'dailyLiquidity',
    'longTermLiquidity',
    'riskLevel',
    'detectedInstruments',
    'commissionsAmount',
    'taxWithheld',
    'qualityScore',
    'missingFields',
  ],
  invoice_cfdi: ['issuerName', 'receiverName', 'subtotal', 'iva', 'total', 'appliedRows', 'skippedDuplicateRows', 'matchedTransactionIds', 'qualityScore', 'missingFields'],
  purchase_receipt: ['merchant', 'date', 'total', 'iva', 'appliedRows', 'skippedDuplicateRows', 'ocrConfidence', 'qualityScore'],
  unknown: ['qualityScore', 'textLength', 'missingFields'],
}

const safePreviewFields = new Set([
  'accountLast4',
  'accountType',
  'ambiguousDirectionRows',
  'annualYieldPercent',
  'appliedRows',
  'availableCredit',
  'availableToInvest',
  'availableToWithdraw',
  'balance',
  'balancePendingReview',
  'balanceDetected',
  'bankBalanceDifference',
  'bankReconciliationStatus',
  'balanceDeltaDepositRows',
  'balanceDeltaInferredRows',
  'balanceDeltaWithdrawalRows',
  'baseContributionSalary',
  'cardReconciliationDifference',
  'cardReconciliationStatus',
  'cardLowestInterestScenario',
  'cardMaxInterestSavings',
  'cashBalance',
  'catPercent',
  'closingBalance',
  'creditLimit',
  'currentBalance',
  'cutoffDate',
  'debtPaymentRows',
  'deductionConcepts',
  'detectedFields',
  'depositRows',
  'depositsTotal',
  'documentSubtypeLabel',
  'expectedClosingBalance',
  'expectedFields',
  'feesAmount',
  'financialCostsTotal',
  'grossAmount',
  'incomeRows',
  'interestAmount',
  'investmentProduct',
  'investmentBuyRows',
  'investmentIncomeRows',
  'investmentOperationRowCount',
  'investmentSellRows',
  'isrWithheld',
  'mandatoryContributions',
  'maturityDate',
  'minimumPayment',
  'missingFields',
  'monthlyContribution',
  'netAmount',
  'netCashFlow',
  'newCharges',
  'noInterestPayment',
  'nominalGatPercent',
  'openingBalance',
  'paidDays',
  'paymentsAmount',
  'payrollAccountDepositRows',
  'payrollAccountMixedFlow',
  'payrollAccountWithdrawalRows',
  'payrollDepositRows',
  'payrollComplementVersion',
  'payrollPeriodicity',
  'payrollType',
  'pdfTextMode',
  'pdfTextPagesRead',
  'periodEnd',
  'periodStart',
  'periodYield',
  'perceptionConcepts',
  'portfolioValue',
  'positionRows',
  'positionsMarketValue',
  'qualityScore',
  'realGatPercent',
  'requiresRawReimport',
  'retirementBalance',
  'retirementProduct',
  'retirementWithdrawals',
  'savingsProduct',
  'statementMovementRows',
  'subaccountBalanceTotal',
  'subaccountRows',
  'subaccounts',
  'taxDeductibleAmount',
  'taxWithheld',
  'textLength',
  'total',
  'totalDeducciones',
  'totalOtherDeductions',
  'totalPercepciones',
  'tradedAmount',
  'transferRows',
  'vatAmount',
  'voluntaryContributions',
  'weeksContributed',
  'withdrawalsTotal',
  'withdrawalRows',
])

const sensitiveDetailFields = new Set(['concept', 'description', 'key', 'name', 'reference', 'ticker'])

function formatExtractedValue(key: string, value: unknown) {
  if (typeof value === 'boolean') return value ? 'si' : 'no'
  if ((key === 'cardReconciliationStatus' || key === 'bankReconciliationStatus') && typeof value === 'string') {
    if (value === 'balanced') return 'cuadra'
    if (value === 'mismatch') return 'no cuadra'
    return 'faltan datos'
  }
  if (key === 'cardReconciliationSeverity' && typeof value === 'string') {
    if (value === 'ok') return 'bajo'
    if (value === 'high') return 'alto'
    return 'medio'
  }
  if (typeof value === 'number') {
    if (moneyFields.has(key)) {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value)
    }
    if (percentFields.has(key)) {
      const normalized = value <= 1 ? value * 100 : value
      const precision = ['annualYieldPercent', 'nominalGatPercent', 'ordinaryAnnualRate', 'realGatPercent'].includes(key) ? 1 : normalized >= 10 ? 0 : 1
      return `${normalized.toFixed(precision)}%`
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(value < 1 ? 2 : 2)
  }
  if (typeof value === 'string') return value
  if (key === 'matchedTransactionIds' && Array.isArray(value)) return `${value.length} movimiento(s)`
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string') ? value.join(', ') : `${value.length} elemento(s)`
  return ''
}

function extractedPreviewEntries(doc: ImportedDocument) {
  const extracted = doc.extracted ?? {}
  const priority = extractedFieldPriority[doc.kind ?? 'unknown'] ?? []
  const orderedKeys = [...priority, ...Object.keys(extracted).filter((key) => !priority.includes(key))]
  return orderedKeys
    .filter((key) => safePreviewFields.has(key))
    .map((key) => [key, extracted[key]] as const)
    .map(([key, value]) => [key, formatExtractedValue(key, value)] as const)
    .filter(([, value]) => value)
    .slice(0, 20)
}

function safeDocumentTitle(doc: ImportedDocument, index: number) {
  return `${documentKindLabels[doc.kind ?? 'unknown']} ${index + 1}`
}

function safeDocumentSummary(doc: ImportedDocument) {
  const quality = documentQualitySummary(doc)
  const rowLabel = doc.extractedRows === 1 ? 'partida detectada' : 'partidas detectadas'
  return `${documentKindLabels[doc.kind ?? 'unknown']} ${doc.status}; ${doc.extractedRows} ${rowLabel}; campos clave ${quality.detectedFields}/${quality.expectedFields || 0}.`
}

type ExtractedDetailColumn = {
  key: string
  label: string
}

const positionColumns: ExtractedDetailColumn[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'instrumentType', label: 'Tipo' },
  { key: 'quantity', label: 'Cantidad' },
  { key: 'price', label: 'Precio' },
  { key: 'marketValue', label: 'Valor' },
  { key: 'unrealizedGain', label: 'Ganancia' },
]

const subaccountColumns: ExtractedDetailColumn[] = [
  { key: 'name', label: 'Subcuenta' },
  { key: 'balance', label: 'Saldo' },
  { key: 'contributions', label: 'Aportaciones' },
  { key: 'withdrawals', label: 'Retiros' },
  { key: 'periodReturn', label: 'Rendimiento' },
]

const investmentOperationColumns: ExtractedDetailColumn[] = [
  { key: 'tradeDate', label: 'Operacion' },
  { key: 'settlementDate', label: 'Liquidacion' },
  { key: 'operationType', label: 'Tipo' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'market', label: 'Mercado' },
  { key: 'quantity', label: 'Titulos' },
  { key: 'price', label: 'Precio' },
  { key: 'grossAmount', label: 'Importe' },
  { key: 'commission', label: 'Comision' },
  { key: 'taxWithheld', label: 'ISR' },
  { key: 'cashFlow', label: 'Flujo' },
]

const statementMovementColumns: ExtractedDetailColumn[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'description', label: 'Concepto' },
  { key: 'deposit', label: 'Deposito' },
  { key: 'withdrawal', label: 'Retiro' },
  { key: 'balance', label: 'Saldo' },
  { key: 'movementType', label: 'Tipo' },
  { key: 'category', label: 'Categoria' },
]

const cardMovementColumns: ExtractedDetailColumn[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'description', label: 'Concepto' },
  { key: 'charge', label: 'Cargo' },
  { key: 'payment', label: 'Pago' },
  { key: 'credit', label: 'Credito' },
  { key: 'balance', label: 'Saldo' },
  { key: 'movementType', label: 'Tipo' },
  { key: 'category', label: 'Categoria' },
]

const cardPaymentScenarioColumns: ExtractedDetailColumn[] = [
  { key: 'scenarioName', label: 'Escenario' },
  { key: 'monthlyPayment', label: 'Pago mensual' },
  { key: 'monthsToPayoff', label: 'Meses' },
  { key: 'estimatedInterest', label: 'Interes estimado' },
  { key: 'estimatedTotalCost', label: 'Costo total' },
]

const payrollPerceptionColumns: ExtractedDetailColumn[] = [
  { key: 'type', label: 'Tipo' },
  { key: 'key', label: 'Clave' },
  { key: 'concept', label: 'Concepto' },
  { key: 'amount', label: 'Importe' },
  { key: 'taxable', label: 'Gravado' },
  { key: 'exempt', label: 'Exento' },
]

const payrollConceptColumns: ExtractedDetailColumn[] = [
  { key: 'type', label: 'Tipo' },
  { key: 'key', label: 'Clave' },
  { key: 'concept', label: 'Concepto' },
  { key: 'amount', label: 'Importe' },
]

function extractedObjectRows(doc: ImportedDocument, key: string): Array<Record<string, unknown>> {
  const value = doc.extracted?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
}

function ExtractedDetailTable({
  title,
  rows,
  columns,
}: {
  title: string
  rows: Array<Record<string, unknown>>
  columns: ExtractedDetailColumn[]
}) {
  if (!rows.length) return null

  return (
    <details className="document-detail-table" data-testid="document-detail-table" data-detail-title={title}>
      <summary>
        <span>{title}</span>
        <strong>{rows.length} partida(s)</strong>
      </summary>
      <div className="document-detail-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {columns.map((column) => (
                  <td key={column.key}>{sensitiveDetailFields.has(column.key) ? 'Dato protegido' : formatExtractedValue(column.key, row[column.key]) || '--'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function Imports({
  profile,
  importMessage,
  isImporting,
  importQueue,
  onFiles,
  onReanalyzePersistedDocuments,
  onApplyReviewedDocumentMovements,
}: {
  profile: FinancialProfile
  importMessage: string
  isImporting: boolean
  importQueue: string[]
  onFiles: (files: File[], mode: 'current' | 'new') => void
  onReanalyzePersistedDocuments: () => void
  onApplyReviewedDocumentMovements: (documentId: string) => void
}) {
  const quality = analyzeDocumentQuality(profile)

  function selectedFiles(fileList: FileList | null) {
    return Array.from(fileList ?? [])
  }

  return (
    <div className="dashboard-grid">
      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Ingreso de documentos</h2>
            <p>Sube lotes de CSV, PDF, XML o imagenes. El primer selector actualiza solo el perfil activo.</p>
          </div>
          <ArrowDownToLine size={24} />
        </div>
        <label className="drop-zone">
          <Upload size={28} />
          <span>{isImporting ? 'Procesando localmente...' : `Agregar documentos a ${profileDisplayName(profile, [profile])}`}</span>
          <input type="file" multiple accept={documentImportAccept} onChange={(event) => onFiles(selectedFiles(event.target.files), 'current')} />
        </label>
        <div className="import-actions">
          <label className="ghost primary">
            <Plus size={18} /> Crear perfil nuevo con documentos
            <input type="file" multiple accept={documentImportAccept} onChange={(event) => onFiles(selectedFiles(event.target.files), 'new')} />
          </label>
        </div>
        {importQueue.length > 0 && (
          <div className="import-queue">
            {importQueue.map((fileName, index) => (
              <span key={`${fileName}-${index}`}>{fileName}</span>
            ))}
          </div>
        )}
        {importMessage && <p className="import-message">{importMessage}</p>}
      </section>

      <section className="panel document-quality-panel">
        <div className="panel-heading">
          <div>
            <h2>Calidad de extraccion</h2>
            <p>Cobertura por documento antes de confiar en saldos, ingresos, deuda o inversiones.</p>
          </div>
          <Gauge size={24} />
        </div>
        {quality.total === 0 ? (
          <p className="empty">Carga documentos para ver cobertura, campos faltantes y prioridades de revision.</p>
        ) : (
          <>
            <div className="document-quality-score" aria-label="Cobertura documental">
              <strong>{Math.round(quality.coverageScore * 100)}%</strong>
              <span>cobertura documental</span>
              <small>
                {quality.detectedFields}/{quality.expectedFields || 'sin'} campos clave detectados
              </small>
            </div>
            <div className="document-quality-kpis">
              <article>
                <CheckCircle2 size={16} />
                <strong>{quality.processed}</strong>
                <span>listos</span>
              </article>
              <article>
                <AlertTriangle size={16} />
                <strong>{quality.review}</strong>
                <span>por revisar</span>
              </article>
              <article>
                <FileText size={16} />
                <strong>{Math.round(quality.avgConfidence * 100)}%</strong>
                <span>confianza</span>
              </article>
            </div>
            <div className="document-capture-readiness" aria-label="Estado de captura de documentos">
              <div>
                <FileText size={18} />
                <strong>Estado de captura</strong>
              </div>
              <p>{quality.captureReadiness.headline}</p>
              <dl>
                <div>
                  <dt>Extractor actual</dt>
                  <dd>{quality.captureReadiness.currentSchemaDocuments}</dd>
                </div>
                <div>
                  <dt>Legado</dt>
                  <dd>{quality.captureReadiness.legacyDocuments}</dd>
                </div>
                <div>
                  <dt>Reimportar</dt>
                  <dd>{quality.captureReadiness.reimportRecommended}</dd>
                </div>
              </dl>
              {!quality.captureReadiness.rawFilesPersisted && (
                <small>No se guarda el archivo crudo; para recapturar texto de documentos antiguos hay que volver a subirlos.</small>
              )}
              <button type="button" className="ghost primary reanalysis-action" onClick={onReanalyzePersistedDocuments}>
                <Gauge size={16} /> Reanalizar documentos guardados
              </button>
            </div>
            <div className="document-risk-card" aria-label="Riesgo de conteo y conciliacion">
              <div>
                <AlertTriangle size={18} />
                <strong>Riesgo de conteo y conciliacion</strong>
              </div>
              <p>{quality.risk.headline}</p>
              <dl>
                <div>
                  <dt>Aplicaron</dt>
                  <dd>{quality.risk.appliedDocuments}</dd>
                </div>
                <div>
                  <dt>Conciliar</dt>
                  <dd>{quality.risk.pendingReconciliation}</dd>
                </div>
                <div>
                  <dt>Omitidos</dt>
                  <dd>{quality.risk.skippedSemanticDuplicates + quality.risk.skippedDuplicateRows}</dd>
                </div>
                <div>
                  <dt>Exactos</dt>
                  <dd>{quality.risk.duplicateTransactionFingerprints + quality.risk.duplicateDocumentIds}</dd>
                </div>
              </dl>
            </div>
            {quality.captureGaps.length > 0 && (
              <div className="document-gap-panel" aria-label="Brechas de captura documental">
                <div>
                  <AlertTriangle size={18} />
                  <strong>Brechas de captura</strong>
                </div>
                {quality.captureGaps.slice(0, 3).map((gap) => (
                  <article key={gap.kind}>
                    <div>
                      <span>{gap.label}</span>
                      <strong>{Math.round(gap.completeness * 100)}%</strong>
                    </div>
                    <p>
                      {gap.legacyDocuments > 0
                        ? `${gap.legacyDocuments} documento(s) legado necesitan reimportacion para usar el extractor actual.`
                        : `${gap.detectedFields}/${gap.expectedFields} campos esperados detectados.`}
                    </p>
                    {gap.missingFields.length > 0 && (
                      <small>
                        Faltan: {gap.missingFields.slice(0, 4).map((field) => `${field.label} (${field.missingDocuments})`).join(', ')}
                      </small>
                    )}
                  </article>
                ))}
              </div>
            )}
            {quality.topActions.length > 0 && (
              <div className="document-next-actions">
                <strong>Prioridades</strong>
                {quality.topActions.map((action) => (
                  <span key={action}>{action}</span>
                ))}
              </div>
            )}
            {quality.improvementPlan.length > 0 && (
              <div className="document-improvement-plan" aria-label="Plan de mejora de datos documentales">
                <div>
                  <AlertTriangle size={18} />
                  <strong>Reimportar primero</strong>
                </div>
                {quality.improvementPlan.map((item) => (
                  <article key={item.label}>
                    <div>
                      <span>{item.priority}</span>
                      <strong>{item.label}</strong>
                      <em>
                        {item.documents} doc. · {Math.round(item.completeness * 100)}%
                      </em>
                    </div>
                    <p>{item.action}</p>
                    <small>{item.reason}</small>
                    {item.missingFields.length > 0 && <small>Campos faltantes: {item.missingFields.join(', ')}</small>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Analisis por tipo de documento</h2>
            <p>Nomina, tarjetas, ahorro e inversiones quedan separados para evitar mezclar flujos con saldos.</p>
          </div>
        </div>
        {quality.buckets.length === 0 ? (
          <p className="empty">Aun no hay documentos clasificados.</p>
        ) : (
          <div className="document-kind-grid">
            {quality.buckets.map((bucket) => (
              <article key={bucket.kind}>
                <div>
                  <span>{bucket.label}</span>
                  <strong>{bucket.total} doc.</strong>
                </div>
                <dl>
                  <div>
                    <dt>Listos</dt>
                    <dd>{bucket.processed}</dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>{bucket.review}</dd>
                  </div>
                  <div>
                    <dt>Confianza</dt>
                    <dd>{bucket.avgConfidence ? `${Math.round(bucket.avgConfidence * 100)}%` : '--'}</dd>
                  </div>
                  <div>
                    <dt>Campos</dt>
                    <dd>
                      {bucket.detectedFields}/{bucket.expectedFields || '--'}
                    </dd>
                  </div>
                </dl>
                {bucket.subtypes.length > 0 && (
                  <div className="document-subtype-list" aria-label={`Subtipos de ${bucket.label}`}>
                    {bucket.subtypes.map((subtype) => (
                      <span key={subtype.label}>
                        <strong>{subtype.label}</strong>
                        {subtype.total} doc. · {Math.round(subtype.completeness * 100)}%
                        {subtype.review > 0 ? ` · ${subtype.review} revisar` : ''}
                        {subtype.legacyDocuments > 0 ? ` · ${subtype.legacyDocuments} legado` : ''}
                        {subtype.reanalysisRecommended > 0 ? ` · ${subtype.reanalysisRecommended} reanalizar` : ''}
                        {subtype.missingFields.length > 0
                          ? ` · faltan ${subtype.missingFields.map((field) => `${field.label} (${field.missingDocuments})`).join(', ')}`
                          : ''}
                      </span>
                    ))}
                  </div>
                )}
                {bucket.missingFields.length > 0 ? (
                  <small>Faltan: {bucket.missingFields.slice(0, 4).join(', ')}</small>
                ) : (
                  <small>{documentReviewActions(bucket.kind)[0]}</small>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Documentos recientes</h2>
            <p>Vista protegida: nombres de archivo, conceptos y texto libre permanecen ocultos por defecto.</p>
          </div>
        </div>
        <div className="document-list">
          {profile.importedDocuments.length === 0 ? (
            <p className="empty">Aun no hay documentos importados en este perfil.</p>
          ) : (
            profile.importedDocuments.map((doc, index) => {
              const extractedEntries = extractedPreviewEntries(doc)
              const qualitySummary = documentQualitySummary(doc)
              const statementMovementRows = extractedObjectRows(doc, 'statementMovementRows')
              const cardMovementRows = extractedObjectRows(doc, 'cardMovementRows')
              const cardPaymentScenarioRows = extractedObjectRows(doc, 'cardPaymentScenarios')
              const investmentOperationRows = extractedObjectRows(doc, 'investmentOperationRows')
              const positionRows = extractedObjectRows(doc, 'positions')
              const subaccountRows = extractedObjectRows(doc, 'subaccountPositions')
              const perceptionRows = extractedObjectRows(doc, 'perceptionConcepts')
              const deductionRows = extractedObjectRows(doc, 'deductionConcepts')
              const otherPaymentRows = extractedObjectRows(doc, 'otherPaymentConcepts')
              const hasReviewedMovementApproval = Boolean(doc.extracted?.reviewedMovementRowsAppliedAt)
              const canApplyStatementMovements = doc.kind === 'bank_statement' && statementMovementRows.length > 0 && !hasReviewedMovementApproval
              const canApplyCardMovements =
                doc.kind === 'credit_card_statement' &&
                cardMovementRows.length > 0 &&
                doc.extracted?.cardReconciliationStatus === 'balanced' &&
                !hasReviewedMovementApproval
              const canApplyReviewedMovements = canApplyStatementMovements || canApplyCardMovements
              return (
                <article
                  key={doc.id}
                  data-testid="imported-document-card"
                  data-document-kind={doc.kind ?? 'unknown'}
                  data-document-status={doc.status}
                  data-document-subtype={typeof doc.extracted?.documentSubtype === 'string' ? doc.extracted.documentSubtype : ''}
                  data-document-index={index}
                >
                  <FileText size={18} />
                  <div>
                    <strong>{safeDocumentTitle(doc, index)}</strong>
                    <span>{safeDocumentSummary(doc)}</span>
                    <small>
                      {doc.fileType.toUpperCase()} · {documentKindLabels[doc.kind ?? 'unknown']} · {doc.status}
                      {doc.confidence !== undefined ? ` · confianza ${Math.round(doc.confidence * 100)}%` : ''}
                    </small>
                    {qualitySummary.expectedFields > 0 && (
                      <div className={`document-quality-chip ${qualitySummary.status}`}>
                        <strong>{qualitySummary.label}</strong>
                        <span>
                          Campos clave: {qualitySummary.detectedFields}/{qualitySummary.expectedFields}
                        </span>
                        {qualitySummary.missingFields.length > 0 && (
                          <small>Faltan: {qualitySummary.missingFields.slice(0, 3).map((field) => field.label).join(', ')}</small>
                        )}
                      </div>
                    )}
                    {extractedEntries.length > 0 && (
                      <dl className="document-fields">
                        {extractedEntries.map(([key, value]) => (
                          <div key={key}>
                            <dt>{extractedFieldLabels[key] ?? key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <ExtractedDetailTable title="Movimientos visibles para revisar" rows={statementMovementRows} columns={statementMovementColumns} />
                    <ExtractedDetailTable title="Movimientos de tarjeta para revisar" rows={cardMovementRows} columns={cardMovementColumns} />
                    <ExtractedDetailTable title="Escenarios de pago de tarjeta" rows={cardPaymentScenarioRows} columns={cardPaymentScenarioColumns} />
                    <ExtractedDetailTable title="Operaciones de inversion para revisar" rows={investmentOperationRows} columns={investmentOperationColumns} />
                    <ExtractedDetailTable title="Percepciones de nomina para revisar" rows={perceptionRows} columns={payrollPerceptionColumns} />
                    <ExtractedDetailTable title="Deducciones de nomina para revisar" rows={deductionRows} columns={payrollConceptColumns} />
                    <ExtractedDetailTable title="Otros pagos de nomina para revisar" rows={otherPaymentRows} columns={payrollConceptColumns} />
                    {canApplyReviewedMovements && (
                      <div className="document-approval-actions">
                        <button type="button" className="ghost primary" onClick={() => onApplyReviewedDocumentMovements(doc.id)}>
                          <CheckCircle2 size={16} /> Aplicar movimientos revisados
                        </button>
                      </div>
                    )}
                    {hasReviewedMovementApproval && (
                      <p className="document-applied-note">
                        Movimientos PDF aplicados: {formatExtractedValue('reviewedMovementRowsApplied', doc.extracted?.reviewedMovementRowsApplied)}
                      </p>
                    )}
                    <ExtractedDetailTable title="Posiciones detectadas para revisar" rows={positionRows} columns={positionColumns} />
                    <ExtractedDetailTable title="Subcuentas detectadas para revisar" rows={subaccountRows} columns={subaccountColumns} />
                    {doc.warnings && doc.warnings.length > 0 && (
                      <ul className="document-warnings">
                        {doc.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
