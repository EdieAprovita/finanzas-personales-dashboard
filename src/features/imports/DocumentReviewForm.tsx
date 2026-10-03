import { useState, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { ImportedDocument } from '../../domain/types'
import type { ReviewedDocumentFields } from '../../lib/importers'

interface DocumentReviewFormProps {
  document: ImportedDocument
  onApply: (documentId: string, fields: ReviewedDocumentFields) => void
}

interface ReviewFormState {
  date: string
  total: string
  merchant: string
  paymentDate: string
  netIncome: string
  currentBalance: string
  creditLimit: string
  minimumPayment: string
  noInterestPayment: string
  cutoffDate: string
  dueDate: string
  previousBalance: string
  newCharges: string
  paymentsAmount: string
  interestAmount: string
  feesAmount: string
  vatAmount: string
}

const amountKeys = [
  'total',
  'netIncome',
  'currentBalance',
  'creditLimit',
  'minimumPayment',
  'noInterestPayment',
  'previousBalance',
  'newCharges',
  'paymentsAmount',
  'interestAmount',
  'feesAmount',
  'vatAmount',
] as const

function textValue(document: ImportedDocument, key: string): string {
  const value = document.extracted?.[key]
  return typeof value === 'string' ? value : ''
}

function amountValue(document: ImportedDocument, key: string): string {
  const value = document.extracted?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function initialState(document: ImportedDocument): ReviewFormState {
  return {
    date: textValue(document, 'date'),
    total: amountValue(document, 'total'),
    merchant: textValue(document, 'merchant'),
    paymentDate: textValue(document, 'paymentDate'),
    netIncome: amountValue(document, 'netIncome'),
    currentBalance: amountValue(document, 'currentBalance'),
    creditLimit: amountValue(document, 'creditLimit'),
    minimumPayment: amountValue(document, 'minimumPayment'),
    noInterestPayment: amountValue(document, 'noInterestPayment'),
    cutoffDate: textValue(document, 'cutoffDate'),
    dueDate: textValue(document, 'dueDate'),
    previousBalance: amountValue(document, 'previousBalance'),
    newCharges: amountValue(document, 'newCharges'),
    paymentsAmount: amountValue(document, 'paymentsAmount'),
    interestAmount: amountValue(document, 'interestAmount'),
    feesAmount: amountValue(document, 'feesAmount'),
    vatAmount: amountValue(document, 'vatAmount'),
  }
}

function reviewedFields(state: ReviewFormState): ReviewedDocumentFields {
  const fields: ReviewedDocumentFields = {}
  for (const key of amountKeys) {
    const raw = state[key].trim()
    if (!raw) continue
    const value = Number(raw)
    if (Number.isFinite(value)) fields[key] = value
  }
  if (state.date) fields.date = state.date
  if (state.merchant.trim()) fields.merchant = state.merchant.trim()
  if (state.paymentDate) fields.paymentDate = state.paymentDate
  if (state.cutoffDate) fields.cutoffDate = state.cutoffDate
  if (state.dueDate) fields.dueDate = state.dueDate
  return fields
}

function optionalAmount(value: string): number | undefined {
  const parsed = Number(value.trim())
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined
}

function cardReconciliationPreview(state: ReviewFormState): { expected: number; difference: number; status: 'balanced' | 'mismatch' | 'insufficient' } {
  const previousBalance = optionalAmount(state.previousBalance)
  const newCharges = optionalAmount(state.newCharges)
  const currentBalance = optionalAmount(state.currentBalance)
  if (previousBalance === undefined || newCharges === undefined || currentBalance === undefined) {
    return { expected: 0, difference: 0, status: 'insufficient' }
  }
  const payments = optionalAmount(state.paymentsAmount) ?? 0
  const interest = optionalAmount(state.interestAmount) ?? 0
  const fees = optionalAmount(state.feesAmount) ?? 0
  const vat = optionalAmount(state.vatAmount) ?? 0
  const expected = Number((previousBalance + newCharges + interest + fees + vat - payments).toFixed(2))
  const difference = Number((currentBalance - expected).toFixed(2))
  return {
    expected,
    difference,
    status: Math.abs(difference) <= 1 ? 'balanced' : 'mismatch',
  }
}

function ReviewAmount({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): ReactNode {
  return (
    <label>
      {label}
      <input inputMode="decimal" min="0" type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

export function DocumentReviewForm({ document, onApply }: DocumentReviewFormProps): ReactNode {
  const [state, setState] = useState<ReviewFormState>(() => initialState(document))
  const isPayroll = document.kind === 'payroll_cfdi'
  const isCard = document.kind === 'credit_card_statement'
  const isReceipt = document.kind === 'purchase_receipt'
  if (!isPayroll && !isCard && !isReceipt) return null

  const update = (key: keyof ReviewFormState, value: string): void => {
    setState((current) => ({ ...current, [key]: value }))
  }
  const reconciliation = cardReconciliationPreview(state)
  const buttonLabel = isReceipt ? 'Confirmar y aplicar gasto' : isPayroll
    ? 'Confirmar y aplicar nómina'
    : 'Confirmar saldo y deuda de tarjeta'
  const reviewImpact = isReceipt ? 'Al confirmar se registrará un gasto por el total revisado del recibo.' : isPayroll
    ? 'Al confirmar se registrará un ingreso; no se crearán gastos.'
    : 'Confirma solo el estado más reciente de esta tarjeta: actualizará la deuda y no creará gastos sin movimientos conciliados.'

  return (
    <form
      className="document-review-form"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(document.id, isReceipt ? { ...reviewedFields(state), date: state.date, total: Number(state.total), merchant: state.merchant } : reviewedFields(state))
      }}
    >
      <div>
        <strong>Revisión antes de aplicar</strong>
        <p>
          Corrige o confirma los campos. La confirmación queda registrada antes de aplicar los datos revisados.
        </p>
        <small className="document-review-impact">{reviewImpact}</small>
      </div>
      {isReceipt && (
        <div className="form-grid">
          <label>Comercio<input required value={state.merchant} onChange={(event) => update('merchant', event.target.value)} /></label>
          <label>Fecha del recibo<input required type="date" value={state.date} onChange={(event) => update('date', event.target.value)} /></label>
          <label>Total del recibo<input required type="number" min="0.01" step="0.01" value={state.total} onChange={(event) => update('total', event.target.value)} /></label>
        </div>
      )}
      {isPayroll && (
        <div className="form-grid">
          <label>
            Fecha de pago
            <input type="date" value={state.paymentDate} onChange={(event) => update('paymentDate', event.target.value)} required />
          </label>
          <ReviewAmount label="Ingreso neto" value={state.netIncome} onChange={(value) => update('netIncome', value)} />
        </div>
      )}
      {isCard && (
        <>
          <div className="form-grid">
          <ReviewAmount label="Saldo actual" value={state.currentBalance} onChange={(value) => update('currentBalance', value)} />
          <ReviewAmount label="Límite de crédito" value={state.creditLimit} onChange={(value) => update('creditLimit', value)} />
          <ReviewAmount label="Pago mínimo" value={state.minimumPayment} onChange={(value) => update('minimumPayment', value)} />
          <ReviewAmount label="Pago para no generar intereses" value={state.noInterestPayment} onChange={(value) => update('noInterestPayment', value)} />
          <label>
            Fecha de corte
            <input type="date" value={state.cutoffDate} onChange={(event) => update('cutoffDate', event.target.value)} />
          </label>
          <label>
            Fecha límite
            <input type="date" value={state.dueDate} onChange={(event) => update('dueDate', event.target.value)} />
          </label>
          <ReviewAmount label="Saldo anterior" value={state.previousBalance} onChange={(value) => update('previousBalance', value)} />
          <ReviewAmount label="Cargos" value={state.newCharges} onChange={(value) => update('newCharges', value)} />
          <ReviewAmount label="Pagos y abonos" value={state.paymentsAmount} onChange={(value) => update('paymentsAmount', value)} />
          <ReviewAmount label="Intereses" value={state.interestAmount} onChange={(value) => update('interestAmount', value)} />
          <ReviewAmount label="Comisiones" value={state.feesAmount} onChange={(value) => update('feesAmount', value)} />
          <ReviewAmount label="IVA" value={state.vatAmount} onChange={(value) => update('vatAmount', value)} />
          </div>
          <p className={`document-reconciliation-preview ${reconciliation.status}`} aria-live="polite">
            {reconciliation.status === 'insufficient'
              ? 'Para conciliar faltan saldo anterior, cargos o saldo actual.'
              : `Saldo esperado: ${reconciliation.expected.toFixed(2)} · diferencia: ${reconciliation.difference.toFixed(2)} · ${reconciliation.status === 'balanced' ? 'cuadra' : 'no cuadra'}.`}
          </p>
        </>
      )}
      <button type="submit" className="ghost primary">
        <CheckCircle2 size={16} /> {buttonLabel}
      </button>
    </form>
  )
}
