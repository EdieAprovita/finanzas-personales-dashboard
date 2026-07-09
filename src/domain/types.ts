export type AccountType =
  | 'checking'
  | 'savings'
  | 'investment'
  | 'retirement'
  | 'credit_card'
  | 'loan'
  | 'property'
  | 'vehicle'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'debt_payment'
export type GoalType = 'savings' | 'travel' | 'small_purchase' | 'large_purchase' | 'home' | 'vehicle' | 'emergency' | 'debt'
export type GoalPriority = 'high' | 'medium' | 'low'
export type Status = 'green' | 'yellow' | 'red'
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
  currency: 'MXN' | 'USD'
  creditLimit?: number
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
  currency?: 'MXN' | 'USD'
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
  currency?: 'MXN' | 'USD'
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
}
