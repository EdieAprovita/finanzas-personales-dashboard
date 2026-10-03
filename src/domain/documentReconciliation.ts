import type { ImportedDocument } from './types'

function numericExtracted(document: ImportedDocument, key: string) {
  const value = document.extracted?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function documentNeedsReconciliation(document: ImportedDocument) {
  return document.status === 'needs_review'
    || document.extracted?.balancePendingReview === true
    || numericExtracted(document, 'skippedRows') > 0
    || numericExtracted(document, 'unparsedDates') > 0
    || (document.kind === 'credit_card_statement'
      && ['mismatch', 'insufficient'].includes(String(document.extracted?.cardReconciliationStatus ?? '')))
    || (document.warnings ?? []).some((warning) => /concili|duplica|revision|pendiente|omit/i.test(warning))
}
