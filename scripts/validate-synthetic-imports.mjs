import { generateSyntheticDocumentFixtures } from './lib/synthetic-document-fixtures.mjs'
import { inspectDocumentDirectory } from './lib/document-inspection.mjs'
import { documentSubtypeForExtracted } from './lib/document-field-specs.mjs'

const fixtures = generateSyntheticDocumentFixtures()
const result = {
  sourceDir: fixtures.dir,
  fixturePolicy: 'synthetic only; no real financial documents',
  ...(await inspectDocumentDirectory(fixtures.dir)),
}

const failures = []
const subtypeContracts = [
  ['credit_card_statement', { cardPaymentScenarios: [{}] }, 'credit_card_statement.payment_scenarios'],
  ['bank_statement', { savingsProduct: 'Cuenta Nu / SOFIPO' }, 'bank_statement.savings_product'],
  ['bank_statement', { speiDetected: true }, 'bank_statement.spei'],
  ['bank_statement', { payrollAccountMixedFlow: true }, 'bank_statement.payroll_account'],
  ['investment_statement', { investmentOperationRows: [{}] }, 'investment_statement.brokerage_operations'],
  ['investment_statement', { investmentProduct: 'GBM Smart Cash' }, 'investment_statement.gbm_smart_cash'],
  ['investment_statement', { investmentProduct: 'Cetesdirecto' }, 'investment_statement.cetesdirecto'],
  ['investment_statement', { retirementProduct: 'PPR' }, 'investment_statement.ppr'],
  ['investment_statement', { retirementProduct: 'AFORE' }, 'investment_statement.afore'],
  ['payroll_cfdi', { payrollComplementVersion: '1.2', totalPercepciones: 1, totalDeducciones: 1 }, 'payroll_cfdi.xml_cfdi'],
]
for (const [kind, extracted, expectedSubtype] of subtypeContracts) {
  const actualSubtype = documentSubtypeForExtracted(kind, extracted).key
  if (actualSubtype !== expectedSubtype) failures.push(`Contrato de subtipo fallo para ${expectedSubtype}; se obtuvo ${actualSubtype}.`)
}
if (result.csv.files < 5) failures.push('No se generaron los CSV sinteticos esperados.')
if (result.csv.rows < 7) failures.push('Los CSV sinteticos no produjeron al menos 7 movimientos validos.')
if (result.csv.unparsedDates !== 0) failures.push('Los CSV sinteticos tienen fechas no parseadas.')
if (result.csv.amexActivityRows < 3) failures.push('El fixture sintetico tipo AMEX no fue reconocido.')
if (result.csv.bankMovementRows < 11 || result.csv.bankDepositRows < 3 || result.csv.bankWithdrawalRows < 5) {
  failures.push('El fixture sintetico de estado de cuenta nomina no reconocio depositos/retiros/saldo.')
}
if (result.csv.bankDepositsTotal !== 46545.3 || result.csv.bankWithdrawalsTotal !== 19450.5 || result.csv.bankNetCashFlow !== 27094.8) {
  failures.push('Los fixtures sinteticos de banco/Nu no sumaron depositos/retiros/flujo neto como se esperaba.')
}
if (result.csv.investmentOperationRows < 3 || result.csv.investmentBuyRows < 1 || result.csv.investmentSellRows < 1 || result.csv.investmentIncomeRows < 1) {
  failures.push('El fixture sintetico de operaciones de inversion no reconocio compra, venta e ingreso patrimonial.')
}
if (result.csv.investmentCommissionsTotal !== 63 || result.csv.investmentTaxWithheld !== 40) {
  failures.push('El fixture sintetico de operaciones de inversion no sumo comisiones e impuestos como se esperaba.')
}
if (result.csv.savingsProductRows < 3 || result.csv.savingsYieldRows < 1) {
  failures.push('El fixture sintetico Nu/Cajitas CSV no reconocio producto, GAT y rendimiento.')
}
if (result.csv.retirementSubaccountRows < 3 || result.csv.retirementSubaccountBalanceTotal !== 520000) {
  failures.push('El fixture sintetico AFORE CSV no reconocio subcuentas y saldo total de retiro.')
}
if (result.xml.payroll < 1 || result.xml.withIncome < 1 || result.xml.lines < 2) {
  failures.push('XML CFDI nomina sintetico no produjo totales/lineas esperadas.')
}
if (
  result.xml.withPeriod < 1 ||
  result.xml.withVersion < 1 ||
  result.xml.withReceiver < 1 ||
  result.xml.withStamp < 1 ||
  result.xml.withIsr < 1 ||
  result.xml.withImss < 1 ||
  result.xml.withOtherPaymentDetail < 1
) {
  failures.push('XML CFDI nomina sintetico no produjo version, periodo, receptor, timbre, ISR/IMSS y otros pagos esperados.')
}
if (result.pdf.files < 6 || result.pdf.readable < 6) failures.push('No se generaron o leyeron los PDF sinteticos esperados de tarjeta, ahorro, inversion y retiro.')
if (result.pdf.pagesRead < result.pdf.pages || result.pdf.layoutLines < 30 || result.pdf.textItems < 60) {
  failures.push('PDF sintetico no produjo suficientes senales de lectura por layout en las paginas generadas.')
}
if (result.pdf.paymentSignals < 1 || result.pdf.balanceSignals < 1) {
  failures.push('PDF sintetico no detecto campos de tarjeta esperados.')
}
if (result.pdf.reconciliationSignals < 1) failures.push('PDF sintetico no detecto campos de conciliacion de tarjeta.')
if (result.pdf.cardPaymentScenarioSignals < 3) failures.push('PDF sintetico no detecto escenarios de pago de tarjeta.')
if (result.pdf.cardMovementSignals < 2) failures.push('PDF sintetico no detecto movimientos visibles de tarjeta en paginas posteriores para revision.')
if (result.pdf.speiSignals < 1) failures.push('PDF sintetico no detecto campos CEP/SPEI oficiales para revision.')
if (result.pdf.savingsSignals < 1) failures.push('PDF sintetico no detecto campos de Cuenta Nu/Cajitas/GAT.')
if (result.pdf.yieldValiditySignals < 1) failures.push('PDF sintetico no detecto fechas de calculo/vigencia GAT.')
if (result.pdf.movementRowSignals < 3) failures.push('PDF sintetico no detecto movimientos visibles para revision.')
if (result.pdf.amountBalanceMovementSignals < 2) failures.push('PDF sintetico no detecto movimientos compactos con importe y saldo.')
if (result.pdf.investmentSignals < 1) failures.push('PDF sintetico no detecto campos de GBM/Smart Cash/Trading.')
if (result.pdf.cetesSignals < 1) failures.push('PDF sintetico no detecto campos de Cetesdirecto/vencimiento.')
if (result.pdf.pprSignals < 1) failures.push('PDF sintetico no detecto campos de PPR.')
if (result.pdf.aforeSignals < 1 || result.pdf.retirementSignals < 2) failures.push('PDF sintetico no detecto campos de AFORE/retiro.')
if (result.pdf.positionSignals < 3) failures.push('PDF sintetico no detecto posiciones/subcuentas de inversion y retiro.')
if (result.image.files < 1 || result.image.ocrReady < 1) failures.push('Imagen sintetica no detecto comercio y total por OCR.')

if (failures.length) throw new Error(`Validacion sintetica fallo:\n- ${failures.join('\n- ')}`)

console.log(JSON.stringify(result, null, 2))
