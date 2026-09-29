import type { FinancialProfile, ImportedDocument } from '../../domain/types'

export interface ImportResult {
  profile: FinancialProfile
  document: ImportedDocument
}

export interface ImportBatchResult {
  profile: FinancialProfile
  documents: ImportedDocument[]
  summary: string
}

export interface ApplyReviewedMovementsResult {
  profile: FinancialProfile
  document: ImportedDocument
  summary: string
}

/** Values a person explicitly confirmed while reviewing an imported document. */
export interface ReviewedDocumentFields {
  date?: string
  total?: number
  merchant?: string
  paymentDate?: string
  netIncome?: number
  currentBalance?: number
  creditLimit?: number
  minimumPayment?: number
  noInterestPayment?: number
  cutoffDate?: string
  dueDate?: string
  previousBalance?: number
  newCharges?: number
  paymentsAmount?: number
  interestAmount?: number
  feesAmount?: number
  vatAmount?: number
}

export type PositionFact = Record<string, string | number | boolean | undefined>

export type ExtractedFacts = Record<
  string,
  string | number | boolean | string[] | PositionFact[] | undefined
>
