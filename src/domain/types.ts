export type AccountType =
  | 'checking'
  | 'savings'
  | 'investment'
  | 'retirement'
  | 'credit_card'
  | 'loan'
  | 'property'
  | 'vehicle'
  | 'receivable'
  | 'business'
  | 'other_asset'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'debt_payment'
export type GoalType = 'savings' | 'travel' | 'small_purchase' | 'large_purchase' | 'home' | 'vehicle' | 'emergency' | 'debt'
export type GoalPriority = 'high' | 'medium' | 'low'
export type Status = 'green' | 'yellow' | 'red'
export type Currency = 'MXN' | 'USD'
export const PROFILE_SCHEMA_VERSION = 2
export type DocumentKind =
  | 'credit_card_statement'
  | 'payroll_cfdi'
  | 'bank_statement'
  | 'investment_statement'
  | 'invoice_cfdi'
  | 'purchase_receipt'
  | 'unknown'

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number
  currency: Currency
  creditLimit?: number
}

export interface InvestmentPosition {
  id: string
  accountId: string
  name: string
  instrumentType?: string
  quantity?: number
  price?: number
  marketValue: number
  currency: Currency
  unrealizedGain?: number
  asOfDate: string
  sourceDocumentId?: string
}

export interface Transaction {
  id: string
  date: string
  amount: number
  merchant: string
  category: string
  accountId: string
  type: TransactionType
  isRecurring?: boolean
  isEssential?: boolean
  goalId?: string
  debtId?: string
  isManual?: boolean
}

export interface Debt {
  id: string
  accountId?: string
  name: string
  balance: number
  apr: number
  minimumPayment: number
  creditLimit?: number
  cutoffDate?: string
  paymentToAvoidInterest?: number
  currency?: Currency
  dueDate: string
}

export interface Goal {
  id: string
  name: string
  type: GoalType
  targetAmount: number
  currentSaved: number
  targetDate: string
  plannedMonthlyContribution: number
  currency?: Currency
  priority?: GoalPriority
  targetCoverageMonths?: number
  evidenceLabel?: string
  evidenceUrl?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface Budget {
  category: string
  monthlyLimit: number
}

export interface MonthlySnapshot {
  month: string
  income: number
  expenses: number
  debtPayments: number
  savings: number
  netWorth: number
  /** Fecha hasta la que el usuario confirmó que los saldos del periodo están actualizados. */
  balanceAsOf?: string
  /** Momento en que el usuario confirmó el cierre después de resolver pendientes documentales. */
  reconciledAt?: string
  /** Balances documentados al cierre del mes. Son opcionales para no inventar historia previa. */
  liquidCash?: number
  debtBalance?: number
  debtMinimumPayments?: number
  cardBalance?: number
  cardLimit?: number
  sourceDocumentIds?: string[]
}

export interface ImportedDocument {
  id: string
  documentFingerprint?: string
  fingerprintVersion?: string
  fileName: string
  fileType: 'pdf' | 'csv' | 'xml' | 'image'
  importedAt: string
  status: 'processed' | 'needs_review' | 'rejected'
  summary: string
  extractedRows: number
  kind?: DocumentKind
  detectedInstitution?: string
  confidence?: number
  extractorVersion?: string
  sourceHash?: string
  sourceBlobPath?: string
  periodStart?: string
  periodEnd?: string
  currency?: Currency
  fieldConfidences?: Record<string, number>
  classificationReasons?: string[]
  extracted?: Record<string, unknown>
  sourceTransactionIds?: string[]
  warnings?: string[]
}

export interface FinancialProfile {
  schemaVersion: number
  reportingCurrency: 'MXN'
  id: string
  name: string
  description: string
  grossMonthlyIncome: number
  netMonthlyIncome: number
  accounts: Account[]
  transactions: Transaction[]
  debts: Debt[]
  goals: Goal[]
  budgets: Budget[]
  monthlySnapshots: MonthlySnapshot[]
  importedDocuments: ImportedDocument[]
  investmentPositions?: InvestmentPosition[]
}
