import type { FinancialProfile, ImportedDocument, MonthlySnapshot } from './types'

function finiteDocumentFact(document: ImportedDocument, key: string) {
  const value = document.extracted?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function documentSnapshotMonth(document: ImportedDocument) {
  const extracted = document.extracted ?? {}
  const date = [extracted.periodEnd, extracted.cutoffDate, extracted.statementDate].find(
    (value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
  )
  return date?.slice(0, 7)
}

/**
 * Adds balances only when a dated document has passed the explicit manual-apply gate.
 * A snapshot can still be partial: callers must keep it as limited rather than claim
 * it represents every account the person owns.
 */
export function enrichSnapshotsWithDocumentPositions(profile: FinancialProfile, snapshots: MonthlySnapshot[]) {
  const latestDocumentByAccountMonth = new Map<string, ImportedDocument>()
  for (const document of profile.importedDocuments) {
    if (document.status !== 'processed') continue
    const month = documentSnapshotMonth(document)
    const accountId = typeof document.extracted?.accountId === 'string' ? document.extracted.accountId : document.id
    if (!month) continue
    const key = `${month}:${document.kind ?? 'unknown'}:${accountId}`
    const previous = latestDocumentByAccountMonth.get(key)
    if (!previous || document.importedAt > previous.importedAt) latestDocumentByAccountMonth.set(key, document)
  }

  const documentedByMonth = new Map<
    string,
    { liquidCash: number; debtBalance: number; debtMinimumPayments: number; cardBalance: number; cardLimit: number; sourceDocumentIds: Set<string>; hasLiquidCash: boolean; hasDebt: boolean; hasCard: boolean }
  >()
  for (const document of latestDocumentByAccountMonth.values()) {
    const month = documentSnapshotMonth(document)
    if (!month) continue
    const position = documentedByMonth.get(month) ?? {
      liquidCash: 0,
      debtBalance: 0,
      debtMinimumPayments: 0,
      cardBalance: 0,
      cardLimit: 0,
      sourceDocumentIds: new Set<string>(),
      hasLiquidCash: false,
      hasDebt: false,
      hasCard: false,
    }
    const closingBalance = finiteDocumentFact(document, 'closingBalance') ?? finiteDocumentFact(document, 'currentBalance')
    if (document.kind === 'bank_statement' && closingBalance !== undefined) {
      position.liquidCash += closingBalance
      position.hasLiquidCash = true
      position.sourceDocumentIds.add(document.id)
    }
    if (document.kind === 'credit_card_statement') {
      const cardBalance = finiteDocumentFact(document, 'currentBalance') ?? finiteDocumentFact(document, 'totalDebtBalance')
      const cardLimit = finiteDocumentFact(document, 'creditLimit')
      const minimumPayment = finiteDocumentFact(document, 'minimumPayment')
      if (cardBalance !== undefined) {
        position.cardBalance += cardBalance
        position.debtBalance += cardBalance
        position.hasCard = true
        position.hasDebt = true
        position.sourceDocumentIds.add(document.id)
      }
      if (cardLimit !== undefined) {
        position.cardLimit += cardLimit
        position.hasCard = true
        position.sourceDocumentIds.add(document.id)
      }
      if (minimumPayment !== undefined) {
        position.debtMinimumPayments += minimumPayment
        position.hasDebt = true
        position.sourceDocumentIds.add(document.id)
      }
    }
    documentedByMonth.set(month, position)
  }

  return snapshots.map((snapshot) => {
    const position = documentedByMonth.get(snapshot.month)
    if (!position) return snapshot
    return {
      ...snapshot,
      ...(position.hasLiquidCash ? { liquidCash: Number(position.liquidCash.toFixed(2)) } : {}),
      ...(position.hasDebt ? { debtBalance: Number(position.debtBalance.toFixed(2)), debtMinimumPayments: Number(position.debtMinimumPayments.toFixed(2)) } : {}),
      ...(position.hasCard ? { cardBalance: Number(position.cardBalance.toFixed(2)), cardLimit: Number(position.cardLimit.toFixed(2)) } : {}),
      sourceDocumentIds: [...new Set([...(snapshot.sourceDocumentIds ?? []), ...position.sourceDocumentIds])],
    }
  })
}

function accountAssetValue(profile: FinancialProfile, accountId: string, fallbackBalance: number) {
  const positions = (profile.investmentPositions ?? []).filter((position) => position.accountId === accountId && position.currency === profile.reportingCurrency)
  if (!positions.length) return Math.max(0, fallbackBalance)
  return positions.reduce((sum, position) => sum + position.marketValue, 0)
}

export function recalculateLatestSnapshot(profile: FinancialProfile, asOfDate: string): FinancialProfile {
  const currentMonth = asOfDate.slice(0, 7)
  if (profile.importedDocuments.length > 0 && profile.transactions.length > 0) {
    const byMonth = new Map<string, { income: number; expenses: number; debtPayments: number }>()
    for (const tx of profile.transactions) {
      const monthKey = tx.date.slice(0, 7)
      const current = byMonth.get(monthKey) ?? { income: 0, expenses: 0, debtPayments: 0 }
      if (tx.type === 'debt_payment') current.debtPayments += Math.abs(tx.amount)
      else if (tx.type === 'income') current.income += Math.max(0, tx.amount)
      else if (tx.type === 'expense') current.expenses += Math.abs(tx.amount)
      byMonth.set(monthKey, current)
    }
    const accountAssets = profile.accounts
      .filter((account) => account.currency === profile.reportingCurrency && !['credit_card', 'loan'].includes(account.type))
      .reduce((sum, account) => sum + accountAssetValue(profile, account.id, account.balance), 0)
    const linkedDebtAccountIds = new Set(profile.debts.map((debt) => debt.accountId).filter(Boolean))
    const accountLiabilities = profile.accounts
      .filter((account) => account.currency === profile.reportingCurrency && ['credit_card', 'loan'].includes(account.type) && !linkedDebtAccountIds.has(account.id))
      .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
    const debtLiabilities = profile.debts
      .filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
      .reduce((sum, debt) => sum + debt.balance, 0)
    const netWorth = accountAssets - accountLiabilities - debtLiabilities
    const previousSnapshots = new Map(profile.monthlySnapshots.map((row) => [row.month, row]))
    const latestTransactionMonth = [...byMonth.keys()].sort().at(-1)
    const monthlySnapshots = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([snapshotMonth, values]) => ({
        month: snapshotMonth,
        income: values.income,
        expenses: values.expenses,
        debtPayments: values.debtPayments,
        savings: values.income - values.expenses - values.debtPayments,
        netWorth: previousSnapshots.get(snapshotMonth)?.netWorth ?? (snapshotMonth === latestTransactionMonth ? netWorth : 0),
        liquidCash: previousSnapshots.get(snapshotMonth)?.liquidCash,
        debtBalance: previousSnapshots.get(snapshotMonth)?.debtBalance,
        debtMinimumPayments: previousSnapshots.get(snapshotMonth)?.debtMinimumPayments,
        cardBalance: previousSnapshots.get(snapshotMonth)?.cardBalance,
        cardLimit: previousSnapshots.get(snapshotMonth)?.cardLimit,
        sourceDocumentIds: previousSnapshots.get(snapshotMonth)?.sourceDocumentIds,
      }))
    return {
      ...profile,
      monthlySnapshots: enrichSnapshotsWithDocumentPositions(profile, monthlySnapshots),
    }
  }

  const month = currentMonth
  const currentMonthTransactions = profile.transactions.filter((tx) => tx.date.startsWith(month))
  if (currentMonthTransactions.length === 0) return profile
  const income = currentMonthTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Math.max(0, tx.amount), 0)
  const expenses = currentMonthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const debtPayments = currentMonthTransactions
    .filter((tx) => tx.type === 'debt_payment')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const accountAssets = profile.accounts
    .filter((account) => account.currency === profile.reportingCurrency && !['credit_card', 'loan'].includes(account.type))
    .reduce((sum, account) => sum + accountAssetValue(profile, account.id, account.balance), 0)
  const linkedDebtAccountIds = new Set(profile.debts.map((debt) => debt.accountId).filter(Boolean))
  const accountLiabilities = profile.accounts
    .filter((account) => account.currency === profile.reportingCurrency && ['credit_card', 'loan'].includes(account.type) && !linkedDebtAccountIds.has(account.id))
    .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
  const debtLiabilities = profile.debts
    .filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
    .reduce((sum, debt) => sum + debt.balance, 0)
  const netWorth = accountAssets - accountLiabilities - debtLiabilities
  const previousSnapshot = profile.monthlySnapshots.find((row) => row.month === month)
  const nextSnapshot = {
    month,
    income,
    expenses,
    debtPayments,
    savings: income - expenses - debtPayments,
    netWorth,
    liquidCash: previousSnapshot?.liquidCash,
    debtBalance: previousSnapshot?.debtBalance,
    debtMinimumPayments: previousSnapshot?.debtMinimumPayments,
    cardBalance: previousSnapshot?.cardBalance,
    cardLimit: previousSnapshot?.cardLimit,
    sourceDocumentIds: previousSnapshot?.sourceDocumentIds,
  }
  const snapshots = profile.monthlySnapshots.filter((row) => row.month !== month)
  return {
    ...profile,
    grossMonthlyIncome: Math.max(profile.grossMonthlyIncome, income),
    netMonthlyIncome: Math.max(profile.netMonthlyIncome, income),
    monthlySnapshots: enrichSnapshotsWithDocumentPositions(profile, [...snapshots, nextSnapshot].sort((a, b) => a.month.localeCompare(b.month))),
  }
}
