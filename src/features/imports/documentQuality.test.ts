import { describe, expect, it } from 'vitest'
import type { FinancialProfile, ImportedDocument } from '../../domain/types'
import { analyzeDocumentQuality, documentQualitySummary } from './documentQuality'

function profileWithDocuments(importedDocuments: ImportedDocument[]): FinancialProfile {
  return {
    schemaVersion: 2,
    reportingCurrency: 'MXN',
    id: 'quality-test',
    name: 'Quality test',
    description: '',
    grossMonthlyIncome: 0,
    netMonthlyIncome: 0,
    accounts: [],
    transactions: [],
    debts: [],
    goals: [],
    budgets: [],
    monthlySnapshots: [],
    importedDocuments,
  }
}

function documentWithExtracted(extracted: Record<string, unknown>, overrides: Partial<ImportedDocument> = {}): ImportedDocument {
  return {
    id: 'quality-document',
    fileName: 'fixture.csv',
    fileType: 'csv',
    importedAt: '2026-07-09T00:00:00.000Z',
    status: 'processed',
    summary: 'fixture',
    extractedRows: 10,
    kind: 'credit_card_statement',
    extracted,
    ...overrides,
  }
}

describe('document quality by source subtype', () => {
  it('scores Account Activity by movement coverage instead of statement fields', () => {
    const activity = documentWithExtracted({
      qualitySchemaVersion: 2,
      schema: 'amex_account_activity_mx',
      documentSubtype: 'credit_card_statement.card_activity',
      cardActivityRows: 10,
      cardActivityDates: 10,
      cardActivityDescriptions: 10,
      cardActivityAmounts: 10,
      cardActivityCurrency: 'MXN',
      appliedRows: 10,
    })

    const summary = documentQualitySummary(activity)
    const quality = analyzeDocumentQuality(profileWithDocuments([activity]))

    expect(summary.status).toBe('complete')
    expect(summary.detectedFields).toBe(5)
    expect(summary.expectedFields).toBe(5)
    expect(summary.missingFields).toEqual([])
    expect(quality.buckets[0]?.subtypes[0]?.label).toBe('Actividad de tarjeta')
    expect(quality.captureReadiness.incompleteDocuments).toBe(0)
    expect(quality.captureReadiness.reimportRecommended).toBe(0)
  })

  it('keeps a current-schema PDF incomplete without calling it legacy or reimport-required', () => {
    const pdf = documentWithExtracted(
      {
        qualitySchemaVersion: 2,
        documentSubtype: 'credit_card_statement.statement',
        expectedFields: 11,
        detectedFields: 4,
        missingFields: ['dueDate', 'minimumPayment', 'creditLimit'],
        qualityScore: 0.36,
      },
      {
        id: 'quality-pdf',
        fileName: 'statement.pdf',
        fileType: 'pdf',
        status: 'needs_review',
        extractedRows: 0,
      },
    )

    const quality = analyzeDocumentQuality(profileWithDocuments([pdf]))

    expect(documentQualitySummary(pdf).status).toBe('incomplete')
    expect(quality.captureReadiness.currentSchemaDocuments).toBe(1)
    expect(quality.captureReadiness.incompleteDocuments).toBe(1)
    expect(quality.captureReadiness.legacyDocuments).toBe(0)
    expect(quality.captureReadiness.reimportRecommended).toBe(0)
    expect(quality.captureReadiness.headline).toContain('campos incompletos')
  })
})
