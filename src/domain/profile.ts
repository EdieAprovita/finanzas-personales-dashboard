import { PROFILE_SCHEMA_VERSION, type Account, type Debt, type FinancialProfile, type ImportedDocument } from './types'

type LegacyProfile = Omit<FinancialProfile, 'schemaVersion' | 'reportingCurrency'> & {
  schemaVersion?: number
  reportingCurrency?: FinancialProfile['reportingCurrency']
}

function normalizedName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function linkedAccountId(debt: Debt, accounts: Account[]): string | undefined {
  if (debt.accountId) return debt.accountId
  const candidates = accounts.filter((account) => ['credit_card', 'loan'].includes(account.type))
  const matchingAccount = candidates.find((account) => normalizedName(account.name) === normalizedName(debt.name))
  return matchingAccount?.id
}

function migrateImportedDocument(document: ImportedDocument): ImportedDocument {
  const extracted = document.extracted ?? {}
  if (extracted.schema !== 'amex_account_activity_mx') return document
  const numeric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0)
  const rows = numeric(extracted.cardActivityRows) || numeric(extracted.rows) || numeric(extracted.appliedRows)
  const usableRows = Math.max(0, rows - numeric(extracted.skippedRows))
  const complete = rows > 0 && usableRows > 0
  return {
    ...document,
    extracted: {
      ...extracted,
      documentSubtype: 'credit_card_statement.card_activity',
      documentSubtypeLabel: 'Actividad de tarjeta',
      cardActivityRows: rows,
      cardActivityDates: numeric(extracted.cardActivityDates) || usableRows,
      cardActivityDescriptions: numeric(extracted.cardActivityDescriptions) || usableRows,
      cardActivityAmounts: numeric(extracted.cardActivityAmounts) || usableRows,
      cardActivityCurrency: extracted.cardActivityCurrency ?? extracted.detectedCurrency ?? 'MXN',
      expectedFields: 5,
      detectedFields: complete ? 5 : 0,
      missingFields: complete ? [] : ['cardActivityRows', 'cardActivityDates', 'cardActivityDescriptions', 'cardActivityAmounts', 'cardActivityCurrency'],
      qualityScore: complete ? 1 : 0.05,
    },
  }
}

/** Migrates persisted profile JSON without discarding accounts, documents, or history. */
export function migrateFinancialProfile(profile: LegacyProfile): FinancialProfile {
  return {
    ...profile,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    reportingCurrency: 'MXN',
    investmentPositions: profile.investmentPositions ?? [],
    importedDocuments: profile.importedDocuments.map(migrateImportedDocument),
    debts: profile.debts.map((debt) => ({
      ...debt,
      accountId: linkedAccountId(debt, profile.accounts),
      currency: debt.currency ?? 'MXN',
    })),
  }
}

export function latestReportingPeriod(profile: FinancialProfile, fallback: string): string {
  return profile.monthlySnapshots.at(-1)?.month ?? profile.transactions.map((transaction) => transaction.date.slice(0, 7)).sort().at(-1) ?? fallback
}
