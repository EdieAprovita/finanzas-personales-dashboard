import { z } from 'zod'

const currencySchema = z.enum(['MXN', 'USD'])

const accountSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  type: z.enum(['checking', 'savings', 'investment', 'retirement', 'credit_card', 'loan', 'property', 'vehicle']),
  balance: z.number().finite(),
  currency: currencySchema,
  creditLimit: z.number().finite().nonnegative().optional(),
})

const transactionSchema = z.object({
  id: z.string().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite(),
  merchant: z.string().min(1).max(300),
  category: z.string().min(1).max(160),
  accountId: z.string().min(1).max(160),
  type: z.enum(['income', 'expense', 'transfer', 'debt_payment']),
  isRecurring: z.boolean().optional(),
  isEssential: z.boolean().optional(),
  goalId: z.string().max(160).optional(),
  debtId: z.string().max(160).optional(),
  isManual: z.boolean().optional(),
})

const debtSchema = z.object({
  id: z.string().min(1).max(160),
  accountId: z.string().max(160).optional(),
  name: z.string().min(1).max(160),
  balance: z.number().finite().nonnegative(),
  apr: z.number().finite().nonnegative(),
  minimumPayment: z.number().finite().nonnegative(),
  creditLimit: z.number().finite().nonnegative().optional(),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentToAvoidInterest: z.number().finite().nonnegative().optional(),
  currency: currencySchema.optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const goalSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  type: z.enum(['savings', 'travel', 'small_purchase', 'large_purchase', 'home', 'vehicle', 'emergency', 'debt']),
  targetAmount: z.number().finite().positive(),
  currentSaved: z.number().finite().nonnegative(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedMonthlyContribution: z.number().finite().nonnegative(),
  currency: currencySchema.optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  targetCoverageMonths: z.number().finite().positive().optional(),
  evidenceLabel: z.string().max(240).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  notes: z.string().max(4000).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

const snapshotSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  income: z.number().finite(),
  expenses: z.number().finite().nonnegative(),
  debtPayments: z.number().finite().nonnegative(),
  savings: z.number().finite(),
  netWorth: z.number().finite(),
})

const importedDocumentSchema = z.object({
  id: z.string().min(1).max(240),
  documentFingerprint: z.string().max(256).optional(),
  fingerprintVersion: z.string().max(64).optional(),
  fileName: z.string().min(1).max(300),
  fileType: z.enum(['pdf', 'csv', 'xml', 'image']),
  importedAt: z.string().datetime(),
  status: z.enum(['processed', 'needs_review', 'rejected']),
  summary: z.string().max(4000),
  extractedRows: z.number().int().nonnegative(),
  kind: z.enum(['credit_card_statement', 'payroll_cfdi', 'bank_statement', 'investment_statement', 'invoice_cfdi', 'purchase_receipt', 'unknown']).optional(),
  detectedInstitution: z.string().max(240).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  classificationReasons: z.array(z.string().max(300)).max(100).optional(),
  extracted: z.record(z.string(), z.unknown()).optional(),
  sourceTransactionIds: z.array(z.string().max(160)).max(10000).optional(),
  warnings: z.array(z.string().max(500)).max(100).optional(),
})

export const financialProfileSchema = z.object({
  schemaVersion: z.literal(2),
  reportingCurrency: z.literal('MXN'),
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  description: z.string().max(1000),
  grossMonthlyIncome: z.number().finite().nonnegative(),
  netMonthlyIncome: z.number().finite().nonnegative(),
  accounts: z.array(accountSchema).max(1000),
  transactions: z.array(transactionSchema).max(50000),
  debts: z.array(debtSchema).max(1000),
  goals: z.array(goalSchema).max(1000),
  budgets: z.array(z.object({ category: z.string().min(1).max(160), monthlyLimit: z.number().finite().nonnegative() })).max(1000),
  monthlySnapshots: z.array(snapshotSchema).max(1200),
  importedDocuments: z.array(importedDocumentSchema).max(10000),
})

export const knowledgeExplainRequestSchema = z.object({
  text: z.string().max(20000),
})

function normalizedName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function migrateProfile(rawProfile) {
  const profile = { ...rawProfile }
  const accounts = Array.isArray(profile.accounts) ? profile.accounts : []
  const debts = Array.isArray(profile.debts) ? profile.debts : []
  return {
    ...profile,
    schemaVersion: 2,
    reportingCurrency: 'MXN',
    debts: debts.map((debt) => {
      if (debt.accountId) return { ...debt, currency: debt.currency ?? 'MXN' }
      const account = accounts.find(
        (candidate) => ['credit_card', 'loan'].includes(candidate.type) && normalizedName(candidate.name) === normalizedName(debt.name),
      )
      return { ...debt, accountId: account?.id, currency: debt.currency ?? 'MXN' }
    }),
  }
}
