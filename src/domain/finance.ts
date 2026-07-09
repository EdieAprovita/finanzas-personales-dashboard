import type { FinancialProfile, Goal, MonthlySnapshot, Status } from './types'

export interface Kpi {
  label: string
  value: string
  helper: string
  status: Status
}

export interface FinancialMetrics {
  period: string
  asOfDate: string
  netWorth: number
  liquidCash: number
  essentialExpenses: number
  cashFlow: number
  monthlyCashFlowMargin: number
  runwayMonths: number
  savingsRate: number
  debtToIncome: number
  creditUtilization: number
  netWorthTrend3M: number
  goalOnTrackRatio: number
  goalMonthlyCapacity: number
  goalMonthlyRequired: number
  goalLoadRatio: number
  financialHealthScore: number
  excludedForeignAccountCount: number
  scoreBreakdown: Record<'cashFlow' | 'runway' | 'debt' | 'savings' | 'netWorthTrend' | 'goals' | 'budget', number>
  kpis: Kpi[]
  categorySpend: { category: string; amount: number; budget: number }[]
  goalReadiness: GoalReadiness[]
}

export interface FinancialMetricContext {
  period: string
  asOfDate: string
}

export interface GoalReadiness {
  goal: Goal
  monthsLeft: number
  remainingAmount: number
  progressRatio: number
  requiredMonthly: number
  plannedCoverageRatio: number
  availableMonthlyCapacity: number
  capacityUtilizationRatio: number
  aggregateGoalLoadRatio: number
  planStatus: Status
  capacityStatus: Status
  status: Status
  isComplete: boolean
  isOverdue: boolean
  warnings: string[]
}

export function mxn(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value)
}

export function pct(value: number) {
  if (!Number.isFinite(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function statusBy(value: number, green: (n: number) => boolean, yellow: (n: number) => boolean): Status {
  if (green(value)) return 'green'
  if (yellow(value)) return 'yellow'
  return 'red'
}

function normalizeScore(value: number, min: number, max: number, inverse = false) {
  const bounded = Math.max(min, Math.min(max, value))
  const normalized = ((bounded - min) / (max - min)) * 100
  return inverse ? 100 - normalized : normalized
}

function monthsBetween(date: Date, targetDate: string) {
  const target = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return 0
  return Math.max(0, (target.getFullYear() - date.getFullYear()) * 12 + target.getMonth() - date.getMonth())
}

function safeRatio(numerator: number, denominator: number, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return fallback
  return numerator / denominator
}

function recentMonthlySavingsCapacity(snapshots: MonthlySnapshot[], currentPeriod: string) {
  const recent = [...snapshots].filter((row) => row.month < currentPeriod).sort((left, right) => left.month.localeCompare(right.month)).slice(-6)
  if (!recent.length) return 0
  const total = recent.reduce((sum, row) => sum + row.income - row.expenses - row.debtPayments, 0)
  return Math.max(0, total / recent.length)
}

function emptySnapshot(month: string): MonthlySnapshot {
  return { month, income: 0, expenses: 0, debtPayments: 0, savings: 0, netWorth: 0 }
}

function averageEssentialExpenses(profile: FinancialProfile, period: string, asOfDate: string) {
  const currentPeriod = asOfDate.slice(0, 7)
  const completedPeriods = [...new Set(profile.transactions.map((tx) => tx.date.slice(0, 7)))]
    .filter((month) => month < currentPeriod)
    .sort()
    .slice(-3)
  const periods = completedPeriods.length ? completedPeriods : [period]
  const total = periods.reduce(
    (sum, month) =>
      sum +
      profile.transactions
        .filter((tx) => tx.date.startsWith(month) && tx.type === 'expense' && tx.isEssential)
        .reduce((monthSum, tx) => monthSum + Math.abs(tx.amount), 0),
    0,
  )
  return total / periods.length
}

export function calculateMetrics(profile: FinancialProfile, context: FinancialMetricContext): FinancialMetrics {
  const { period, asOfDate } = context
  const snapshotsThroughPeriod = [...profile.monthlySnapshots]
    .filter((row) => row.month <= period)
    .sort((left, right) => left.month.localeCompare(right.month))
  const latest = profile.monthlySnapshots.find((row) => row.month === period) ?? emptySnapshot(period)
  const threeMonthsAgo = snapshotsThroughPeriod.at(-4) ?? snapshotsThroughPeriod[0]
  const hasFinancialInputs = profile.accounts.length > 0 || profile.transactions.length > 0 || profile.importedDocuments.length > 0
  const netIncomeBase = Math.max(0, profile.netMonthlyIncome || latest.income || 0)
  const grossIncomeBase = Math.max(0, profile.grossMonthlyIncome || profile.netMonthlyIncome || latest.income || 0)
  const mxnAccounts = profile.accounts.filter((account) => account.currency === profile.reportingCurrency)
  const excludedForeignAccountCount = profile.accounts.length - mxnAccounts.length
  const liquidCash = mxnAccounts
    .filter((account) => ['checking', 'savings'].includes(account.type))
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
  const assets = mxnAccounts
    .filter((account) => account.type !== 'credit_card' && account.type !== 'loan')
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
  const linkedDebtAccountIds = new Set(profile.debts.map((debt) => debt.accountId).filter((id): id is string => Boolean(id)))
  const accountLiabilities = mxnAccounts
    .filter((account) => ['credit_card', 'loan'].includes(account.type) && !linkedDebtAccountIds.has(account.id))
    .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
  const debtLiabilities = profile.debts
    .filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
    .reduce((sum, debt) => sum + Math.max(0, debt.balance), 0)
  const liabilities = accountLiabilities + debtLiabilities
  const netWorth = assets - liabilities
  const essentialExpenses = averageEssentialExpenses(profile, period, asOfDate)
  const totalOutflows = latest.expenses + latest.debtPayments
  const cashFlow = latest.income - totalOutflows
  const monthlyCashFlowMargin = safeRatio(cashFlow, netIncomeBase)
  const runwayMonths = liquidCash / Math.max(1, essentialExpenses)
  const savingsRate = safeRatio(latest.savings, netIncomeBase)
  const reportingDebts = profile.debts.filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
  const debtMinimums = reportingDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0)
  const debtToIncome = safeRatio(debtMinimums, grossIncomeBase)
  const cardDebt = reportingDebts.filter((debt) => debt.creditLimit).reduce((sum, debt) => sum + debt.balance, 0)
  const cardLimit = reportingDebts.filter((debt) => debt.creditLimit).reduce((sum, debt) => sum + (debt.creditLimit ?? 0), 0)
  const creditUtilization = cardLimit > 0 ? cardDebt / cardLimit : 0
  const netWorthTrend3M = threeMonthsAgo ? (latest.netWorth - threeMonthsAgo.netWorth) / Math.max(1, Math.abs(threeMonthsAgo.netWorth)) : 0

  const goalMonthlyCapacity = recentMonthlySavingsCapacity(profile.monthlySnapshots, asOfDate.slice(0, 7))
  const baseGoalReadiness = profile.goals.map((goal) => {
    const warnings: string[] = []
    const targetAmount = Number(goal.targetAmount)
    const currentSaved = Number(goal.currentSaved)
    const plannedMonthlyContribution = Number(goal.plannedMonthlyContribution)
    const monthsLeft = monthsBetween(new Date(`${asOfDate.slice(0, 10)}T00:00:00`), goal.targetDate)
    const isInvalid =
      !Number.isFinite(targetAmount) ||
      !Number.isFinite(currentSaved) ||
      !Number.isFinite(plannedMonthlyContribution) ||
      targetAmount <= 0 ||
      currentSaved < 0 ||
      plannedMonthlyContribution < 0 ||
      Number.isNaN(new Date(`${goal.targetDate}T00:00:00`).getTime())
    const remainingAmount = isInvalid ? 0 : Math.max(0, targetAmount - currentSaved)
    const isComplete = !isInvalid && remainingAmount === 0
    const isOverdue = !isInvalid && monthsLeft === 0 && remainingAmount > 0
    const requiredMonthly = isInvalid || isComplete ? 0 : monthsLeft > 0 ? remainingAmount / monthsLeft : remainingAmount
    const plannedCoverageRatio = isComplete ? 1 : safeRatio(plannedMonthlyContribution, requiredMonthly, 0)
    const capacityUtilizationRatio =
      requiredMonthly === 0 ? 0 : goalMonthlyCapacity > 0 ? requiredMonthly / goalMonthlyCapacity : Number.POSITIVE_INFINITY
    const progressRatio = isInvalid ? 0 : Math.min(1, safeRatio(currentSaved, targetAmount))

    if (isInvalid) warnings.push('Revisa monto, fecha y aportacion.')
    if (isOverdue) warnings.push('La fecha ya paso y aun falta dinero.')
    if (!isComplete && goalMonthlyCapacity <= 0) warnings.push('Captura ingresos y ahorro mensual para medir capacidad.')
    if (!isComplete && plannedMonthlyContribution === 0) warnings.push('Agrega una aportacion mensual planeada.')

    const planStatus = statusBy(plannedCoverageRatio, (n) => n >= 1, (n) => n >= 0.8)
    const capacityStatus = statusBy(capacityUtilizationRatio, (n) => n <= 0.7, (n) => n <= 1)

    return {
      goal,
      monthsLeft,
      remainingAmount,
      progressRatio,
      requiredMonthly,
      plannedCoverageRatio,
      availableMonthlyCapacity: goalMonthlyCapacity,
      capacityUtilizationRatio,
      aggregateGoalLoadRatio: 0,
      planStatus,
      capacityStatus,
      status: isInvalid || isOverdue ? 'red' : isComplete ? 'green' : planStatus === 'green' && capacityStatus !== 'red' ? 'green' : planStatus === 'red' || capacityStatus === 'red' ? 'red' : 'yellow',
      isComplete,
      isOverdue,
      warnings,
    } satisfies GoalReadiness
  })
  const goalMonthlyRequired = baseGoalReadiness.reduce((sum, row) => sum + (row.isComplete ? 0 : row.requiredMonthly), 0)
  const goalLoadRatio = goalMonthlyRequired > 0 && goalMonthlyCapacity > 0 ? goalMonthlyRequired / goalMonthlyCapacity : goalMonthlyRequired > 0 ? Number.POSITIVE_INFINITY : 0
  const goalReadiness = baseGoalReadiness.map((row) => ({
    ...row,
    aggregateGoalLoadRatio: goalLoadRatio,
    status: row.status === 'green' && goalLoadRatio > 1 ? 'yellow' : row.status,
  }))

  const goalOnTrackRatio =
    goalReadiness.reduce((sum, row) => sum + (row.isComplete ? 1 : Math.min(1, row.plannedCoverageRatio)), 0) /
    Math.max(1, goalReadiness.length)

  const cashFlowScore = normalizeScore(monthlyCashFlowMargin, -0.1, 0.25)
  const runwayScore = normalizeScore(runwayMonths, 0, 8)
  const debtScore = normalizeScore(debtToIncome, 0, 0.43, true)
  const savingsScore = normalizeScore(savingsRate, 0, 0.25)
  const netWorthTrendScore = normalizeScore(netWorthTrend3M, -0.05, 0.08)
  const goalScore = normalizeScore(goalOnTrackRatio, 0.6, 1)
  const budgetDisciplineScore = normalizeScore(safeRatio(latest.expenses, netIncomeBase), 0.85, 0.35, true)
  const scoreBreakdown = {
    cashFlow: cashFlowScore * 0.2,
    runway: runwayScore * 0.2,
    debt: debtScore * 0.2,
    savings: savingsScore * 0.15,
    netWorthTrend: netWorthTrendScore * 0.1,
    goals: goalScore * 0.1,
    budget: budgetDisciplineScore * 0.05,
  }
  let financialHealthScore = Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0))
  if (cashFlow < 0) financialHealthScore = Math.min(financialHealthScore, 59)
  if (!hasFinancialInputs) financialHealthScore = 0

  const categorySpend = profile.transactions
    .filter((tx) => tx.type === 'expense' && tx.date.startsWith(period))
    .reduce<{ category: string; amount: number; budget: number }[]>((rows, tx) => {
      const found = rows.find((row) => row.category === tx.category)
      const budget = profile.budgets.find((row) => row.category === tx.category)?.monthlyLimit ?? 0
      if (found) found.amount += Math.abs(tx.amount)
      else rows.push({ category: tx.category, amount: Math.abs(tx.amount), budget })
      return rows
    }, [])
    .sort((a, b) => b.amount - a.amount)

  const kpis: Kpi[] = [
    {
      label: 'Score Finanzas OS',
      value: hasFinancialInputs ? `${financialHealthScore}/100` : 'Sin datos',
      helper: hasFinancialInputs ? `Indicador propio para ${period}; no es una calificacion crediticia.` : 'Agrega cuentas, movimientos o documentos para calcularlo.',
      status: statusBy(financialHealthScore, (n) => n >= 80, (n) => n >= 60),
    },
    {
      label: 'Flujo mensual',
      value: mxn(cashFlow),
      helper: netIncomeBase > 0 ? `${pct(monthlyCashFlowMargin)} del ingreso neto.` : 'Captura ingreso neto para calcular margen.',
      status: statusBy(monthlyCashFlowMargin, (n) => n >= 0.15, (n) => n >= 0),
    },
    {
      label: 'Runway liquido',
      value: `${runwayMonths.toFixed(1)} meses`,
      helper: `${mxn(liquidCash)} contra gastos esenciales.`,
      status: statusBy(runwayMonths, (n) => n >= 6, (n) => n >= 3),
    },
    {
      label: 'Uso de tarjeta',
      value: pct(creditUtilization),
      helper: 'Balance de tarjeta sobre limite disponible.',
      status: statusBy(creditUtilization, (n) => n < 0.3, (n) => n < 0.5),
    },
  ]

  return {
    period,
    asOfDate,
    netWorth,
    liquidCash,
    essentialExpenses,
    cashFlow,
    monthlyCashFlowMargin,
    runwayMonths,
    savingsRate,
    debtToIncome,
    creditUtilization,
    netWorthTrend3M,
    goalOnTrackRatio,
    goalMonthlyCapacity,
    goalMonthlyRequired,
    goalLoadRatio,
    financialHealthScore,
    excludedForeignAccountCount,
    scoreBreakdown,
    kpis,
    categorySpend,
    goalReadiness,
  }
}
