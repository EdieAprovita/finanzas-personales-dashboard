import { PROFILE_SCHEMA_VERSION, type Account, type Debt, type FinancialProfile } from './types'

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

/** Migrates persisted profile JSON without discarding accounts, documents, or history. */
export function migrateFinancialProfile(profile: LegacyProfile): FinancialProfile {
  return {
    ...profile,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    reportingCurrency: 'MXN',
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
