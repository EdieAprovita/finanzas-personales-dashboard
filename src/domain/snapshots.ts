import type { FinancialProfile } from './types'

export function recalculateLatestSnapshot(profile: FinancialProfile): FinancialProfile {
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
      .filter((account) => !['credit_card', 'loan'].includes(account.type))
      .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
    const accountLiabilities = profile.accounts
      .filter((account) => ['credit_card', 'loan'].includes(account.type))
      .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
    const debtLiabilities = profile.debts.reduce((sum, debt) => sum + debt.balance, 0)
    const netWorth = accountAssets - accountLiabilities - debtLiabilities
    const monthlySnapshots = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([snapshotMonth, values]) => ({
        month: snapshotMonth,
        income: values.income,
        expenses: values.expenses,
        debtPayments: values.debtPayments,
        savings: Math.max(0, values.income - values.expenses - values.debtPayments),
        netWorth,
      }))
    return {
      ...profile,
      monthlySnapshots,
    }
  }

  const month = new Date().toISOString().slice(0, 7)
  const currentMonthTransactions = profile.transactions.filter((tx) => tx.date.startsWith(month))
  const income = currentMonthTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Math.max(0, tx.amount), 0)
  const expenses = currentMonthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const debtPayments = currentMonthTransactions
    .filter((tx) => tx.type === 'debt_payment')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const accountAssets = profile.accounts
    .filter((account) => !['credit_card', 'loan'].includes(account.type))
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
  const accountLiabilities = profile.accounts
    .filter((account) => ['credit_card', 'loan'].includes(account.type))
    .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
  const debtLiabilities = profile.debts.reduce((sum, debt) => sum + debt.balance, 0)
  const netWorth = accountAssets - accountLiabilities - debtLiabilities
  const nextSnapshot = {
    month,
    income,
    expenses,
    debtPayments,
    savings: Math.max(0, income - expenses - debtPayments),
    netWorth,
  }
  const snapshots = profile.monthlySnapshots.filter((row) => row.month !== month)
  return {
    ...profile,
    grossMonthlyIncome: Math.max(profile.grossMonthlyIncome, income),
    netMonthlyIncome: Math.max(profile.netMonthlyIncome, income),
    monthlySnapshots: [...snapshots, nextSnapshot].sort((a, b) => a.month.localeCompare(b.month)),
  }
}
