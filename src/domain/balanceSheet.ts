import type { Account, FinancialProfile } from './types'

export type BalanceSheetGroup = 'asset' | 'liability'

export interface BalanceSheetLine {
  id: string
  label: string
  value: number
  group: BalanceSheetGroup
  liquid: boolean
}

export interface BalanceSheet {
  assets: BalanceSheetLine[]
  liabilities: BalanceSheetLine[]
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  liquidNetWorth: number
}

const accountLabels: Record<Account['type'], string> = {
  checking: 'Efectivo y cuentas corrientes',
  savings: 'Ahorros',
  investment: 'Inversiones',
  retirement: 'Pensiones y cesantías',
  credit_card: 'Tarjetas de crédito',
  loan: 'Créditos y préstamos',
  property: 'Inmuebles',
  vehicle: 'Vehículos',
  receivable: 'Cuentas por cobrar',
  business: 'Negocios y participaciones',
  other_asset: 'Otros activos',
}

function accountValue(profile: FinancialProfile, account: Account): number {
  const positions = (profile.investmentPositions ?? []).filter(
    (position) =>
      position.accountId === account.id &&
      position.currency === profile.reportingCurrency,
  )

  return positions.length
    ? positions.reduce((total, position) => total + position.marketValue, 0)
    : Math.max(0, account.balance)
}

function sumByLabel(lines: BalanceSheetLine[]): BalanceSheetLine[] {
  const byLabel = new Map<string, BalanceSheetLine>()

  for (const line of lines) {
    const existing = byLabel.get(line.label)
    byLabel.set(line.label, existing ? { ...existing, value: existing.value + line.value } : line)
  }

  return [...byLabel.values()].sort((left, right) => right.value - left.value)
}

/** Builds a current, currency-consistent personal balance sheet without inventing past valuations. */
export function buildBalanceSheet(profile: FinancialProfile): BalanceSheet {
  const accounts = profile.accounts.filter(
    (account) => account.currency === profile.reportingCurrency,
  )
  const linkedDebtAccountIds = new Set(
    profile.debts.flatMap((debt) => (debt.accountId ? [debt.accountId] : [])),
  )
  const assets = sumByLabel(
    accounts
      .filter((account) => account.type !== 'credit_card' && account.type !== 'loan')
      .map((account) => ({
        id: account.id,
        label: accountLabels[account.type],
        value: accountValue(profile, account),
        group: 'asset' as const,
      liquid: ['checking', 'savings'].includes(account.type),
      })),
  )
  const accountLiabilities = accounts
    .filter(
      (account) =>
        ['credit_card', 'loan'].includes(account.type) &&
        !linkedDebtAccountIds.has(account.id),
    )
    .map((account) => ({
      id: account.id,
      label: accountLabels[account.type],
      value: Math.abs(Math.min(0, account.balance)),
      group: 'liability' as const,
      liquid: false,
    }))
  const debtLiabilities = profile.debts
    .filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
    .map((debt) => ({
      id: debt.id,
      label: debt.name,
      value: Math.max(0, debt.balance),
      group: 'liability' as const,
      liquid: false,
    }))
  const liabilities = sumByLabel([...accountLiabilities, ...debtLiabilities])
  const totalAssets = assets.reduce((total, line) => total + line.value, 0)
  const totalLiabilities = liabilities.reduce((total, line) => total + line.value, 0)
  const liquidAssets = assets
    .filter((line) => line.liquid)
    .reduce((total, line) => total + line.value, 0)

  return {
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    liquidNetWorth: liquidAssets - totalLiabilities,
  }
}
