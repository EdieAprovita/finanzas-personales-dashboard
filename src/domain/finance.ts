import type { FinancialProfile, Goal, MonthlySnapshot, Status } from './types'

export interface Kpi {
  label: string
  value: string
  helper: string
  status: Status
  availability: 'ready' | 'limited' | 'unavailable'
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
  budgetProgress: BudgetProgress[]
  cashFlowForecast: CashFlowForecast
  goalReadiness: GoalReadiness[]
  isHistoricalPeriod: boolean
  dataWarnings: string[]
}

export interface BudgetProgress {
  category: string
  amount: number
  budget: number
  remaining: number
  utilizationRatio: number | null
  status: Status
}

export interface CashFlowForecast {
  monthsAnalyzed: number
  projectedIncome: number
  projectedExpenses: number
  projectedDebtPayments: number
  projectedCashFlow: number
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
  if (!Number.isFinite(value)) return 'yellow'
  if (green(value)) return 'green'
  if (yellow(value)) return 'yellow'
  return 'red'
}

function normalizeScore(value: number, min: number, max: number, inverse = false) {
  if (!Number.isFinite(value)) return 0
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
  const recent = [...snapshots].filter((row) => row.month <= currentPeriod).sort((left, right) => left.month.localeCompare(right.month)).slice(-6)
  if (!recent.length) return 0
  const total = recent.reduce((sum, row) => sum + row.income - row.expenses - row.debtPayments, 0)
  return Math.max(0, total / recent.length)
}

function emptySnapshot(month: string): MonthlySnapshot {
  return { month, income: 0, expenses: 0, debtPayments: 0, savings: 0, netWorth: 0 }
}

function accountAssetValue(profile: FinancialProfile, accountId: string, fallbackBalance: number) {
  const positions = (profile.investmentPositions ?? []).filter((position) => position.accountId === accountId && position.currency === profile.reportingCurrency)
  if (!positions.length) return Math.max(0, fallbackBalance)
  return positions.reduce((sum, position) => sum + position.marketValue, 0)
}

function averageEssentialExpenses(profile: FinancialProfile, period: string) {
  const currentPeriod = period
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

function pendingReviewDocumentsAffectingPeriod(profile: FinancialProfile, period: string) {
  const transactionsById = new Map(profile.transactions.map((transaction) => [transaction.id, transaction]))
  return profile.importedDocuments.filter((document) => {
    if (document.status !== 'needs_review') return false
    return (document.sourceTransactionIds ?? []).some((transactionId) => transactionsById.get(transactionId)?.date.startsWith(period))
  }).length
}

export function calculateMetrics(profile: FinancialProfile, context: FinancialMetricContext): FinancialMetrics {
  const { period, asOfDate } = context
  const currentPeriod = asOfDate.slice(0, 7)
  const isHistoricalPeriod = period !== currentPeriod
  const snapshotsThroughPeriod = [...profile.monthlySnapshots]
    .filter((row) => row.month <= period)
    .sort((left, right) => left.month.localeCompare(right.month))
  const latest = profile.monthlySnapshots.find((row) => row.month === period) ?? emptySnapshot(period)
  const threeMonthsAgo = snapshotsThroughPeriod.at(-4) ?? snapshotsThroughPeriod[0]
  const hasFinancialInputs = profile.accounts.length > 0 || profile.transactions.length > 0 || profile.importedDocuments.length > 0
  const hasPeriodData = profile.monthlySnapshots.some((row) => row.month === period) || profile.transactions.some((tx) => tx.date.startsWith(period))
  const netIncomeBase = Math.max(0, isHistoricalPeriod ? latest.income : profile.netMonthlyIncome || latest.income || 0)
  const grossIncomeBase = Math.max(0, isHistoricalPeriod ? latest.income : profile.grossMonthlyIncome || profile.netMonthlyIncome || latest.income || 0)
  const mxnAccounts = profile.accounts.filter((account) => account.currency === profile.reportingCurrency)
  const excludedForeignAccountCount = profile.accounts.length - mxnAccounts.length
  const currentLiquidCash = mxnAccounts
    .filter((account) => ['checking', 'savings'].includes(account.type))
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
  const assets = mxnAccounts
    .filter((account) => account.type !== 'credit_card' && account.type !== 'loan')
    .reduce((sum, account) => sum + accountAssetValue(profile, account.id, account.balance), 0)
  const linkedDebtAccountIds = new Set(profile.debts.map((debt) => debt.accountId).filter((id): id is string => Boolean(id)))
  const accountLiabilities = mxnAccounts
    .filter((account) => ['credit_card', 'loan'].includes(account.type) && !linkedDebtAccountIds.has(account.id))
    .reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0)
  const debtLiabilities = profile.debts
    .filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
    .reduce((sum, debt) => sum + Math.max(0, debt.balance), 0)
  const liabilities = accountLiabilities + debtLiabilities
  const netWorth = isHistoricalPeriod ? latest.netWorth : assets - liabilities
  const historicalLiquidCash = latest.liquidCash
  const liquidCash = isHistoricalPeriod && typeof historicalLiquidCash === 'number' ? historicalLiquidCash : isHistoricalPeriod ? Number.NaN : currentLiquidCash
  const essentialExpenses = averageEssentialExpenses(profile, period)
  const totalOutflows = latest.expenses + latest.debtPayments
  const cashFlow = latest.income - totalOutflows
  const monthlyCashFlowMargin = safeRatio(cashFlow, netIncomeBase, Number.NaN)
  const runwayMonths = Number.isFinite(liquidCash) && essentialExpenses > 0 ? liquidCash / essentialExpenses : Number.NaN
  const reportingDebts = profile.debts.filter((debt) => (debt.currency ?? 'MXN') === profile.reportingCurrency)
  const currentDebtMinimums = reportingDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0)
  const debtMinimums = isHistoricalPeriod ? latest.debtMinimumPayments : currentDebtMinimums
  const debtToIncome = typeof debtMinimums === 'number' ? safeRatio(debtMinimums, grossIncomeBase, Number.NaN) : Number.NaN
  const currentCardDebt = reportingDebts.filter((debt) => debt.creditLimit).reduce((sum, debt) => sum + debt.balance, 0)
  const currentCardLimit = reportingDebts.filter((debt) => debt.creditLimit).reduce((sum, debt) => sum + (debt.creditLimit ?? 0), 0)
  const cardDebt = isHistoricalPeriod ? latest.cardBalance : currentCardDebt
  const cardLimit = isHistoricalPeriod ? latest.cardLimit : currentCardLimit
  const creditUtilization = typeof cardDebt === 'number' && typeof cardLimit === 'number' && cardLimit > 0 ? cardDebt / cardLimit : Number.NaN
  const savingsRate = Number.isFinite(netIncomeBase) && netIncomeBase > 0 ? safeRatio(latest.savings, netIncomeBase, Number.NaN) : Number.NaN
  const netWorthTrend3M = threeMonthsAgo ? (latest.netWorth - threeMonthsAgo.netWorth) / Math.max(1, Math.abs(threeMonthsAgo.netWorth)) : 0

  const goalMonthlyCapacity = recentMonthlySavingsCapacity(profile.monthlySnapshots, period)
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
  const pendingReviewDocuments = pendingReviewDocumentsAffectingPeriod(profile, period)
  const scoreAvailability: Kpi['availability'] = !hasFinancialInputs || !hasPeriodData ? 'unavailable' : isHistoricalPeriod || pendingReviewDocuments > 0 ? 'limited' : 'ready'
  let financialHealthScore = Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0))
  if (cashFlow < 0) financialHealthScore = Math.min(financialHealthScore, 59)
  if (!hasFinancialInputs || !hasPeriodData) financialHealthScore = 0
  const dataWarnings = [
    ...(pendingReviewDocuments
      ? [`${pendingReviewDocuments} documento(s) pendientes de revisión ya aportan movimientos a ${period}; revisa su conciliación antes de confiar completamente en los KPIs de ese periodo.`]
      : []),
    ...(isHistoricalPeriod && !latest.sourceDocumentIds?.length
      ? ['El periodo seleccionado es histórico. Aún no hay estados conciliados con fecha para conservar efectivo, deuda o límite de tarjeta de ese mes.']
      : []),
    ...(isHistoricalPeriod && latest.sourceDocumentIds?.length
      ? [
          `Periodo histórico respaldado por ${latest.sourceDocumentIds.length} documento(s) conciliado(s). Los saldos pueden ser parciales si faltan estados de otras cuentas.`,
          ...(!Number.isFinite(runwayMonths) ? ['Falta un saldo de liquidez fechado para calcular runway.'] : []),
          ...(!Number.isFinite(debtToIncome) ? ['Falta pago mínimo de deuda fechado para calcular la presión de deuda.'] : []),
          ...(!Number.isFinite(creditUtilization) ? ['Falta saldo y límite de tarjeta fechados para calcular su uso.'] : []),
        ]
      : []),
    ...(profile.accounts.some((account) => account.currency !== profile.reportingCurrency)
      ? ['Hay cuentas en otra moneda excluidas hasta capturar un tipo de cambio fechado.']
      : []),
  ]

  const budgetByCategory = new Map(profile.budgets.map((budget) => [budget.category, budget.monthlyLimit]))
  const spendByCategory = new Map<string, number>()
  for (const transaction of profile.transactions) {
    if (transaction.type !== 'expense' || !transaction.date.startsWith(period)) continue
    spendByCategory.set(transaction.category, (spendByCategory.get(transaction.category) ?? 0) + Math.abs(transaction.amount))
  }
  const categorySpend = [...new Set([...budgetByCategory.keys(), ...spendByCategory.keys()])]
    .map((category) => ({
      category,
      amount: spendByCategory.get(category) ?? 0,
      budget: budgetByCategory.get(category) ?? 0,
    }))
    .sort((left, right) => right.amount - left.amount || left.category.localeCompare(right.category))
  const budgetProgress = categorySpend
    .filter((row) => row.budget > 0 || row.amount > 0)
    .map((row) => {
      const utilizationRatio = row.budget > 0 ? row.amount / row.budget : null
      return {
        ...row,
        remaining: row.budget - row.amount,
        utilizationRatio,
        status: utilizationRatio === null ? 'yellow' : statusBy(utilizationRatio, (value) => value <= 0.8, (value) => value <= 1),
      } satisfies BudgetProgress
    })
    .sort((left, right) => (right.utilizationRatio ?? 0) - (left.utilizationRatio ?? 0) || right.amount - left.amount)
  const forecastRows = snapshotsThroughPeriod.slice(-3)
  const cashFlowForecast = forecastRows.length
    ? {
        monthsAnalyzed: forecastRows.length,
        projectedIncome: forecastRows.reduce((sum, row) => sum + row.income, 0) / forecastRows.length,
        projectedExpenses: forecastRows.reduce((sum, row) => sum + row.expenses, 0) / forecastRows.length,
        projectedDebtPayments: forecastRows.reduce((sum, row) => sum + row.debtPayments, 0) / forecastRows.length,
        projectedCashFlow: 0,
      }
    : {
        monthsAnalyzed: 0,
        projectedIncome: 0,
        projectedExpenses: 0,
        projectedDebtPayments: 0,
        projectedCashFlow: 0,
      }
  cashFlowForecast.projectedCashFlow =
    cashFlowForecast.projectedIncome - cashFlowForecast.projectedExpenses - cashFlowForecast.projectedDebtPayments

  const kpis: Kpi[] = [
    {
      label: 'Score Finanzas OS',
      value: scoreAvailability === 'unavailable' ? 'Sin datos' : `${financialHealthScore}/100`,
      helper:
        scoreAvailability === 'unavailable'
          ? 'Agrega movimientos o un snapshot del periodo para calcularlo.'
          : scoreAvailability === 'limited'
            ? `Lectura limitada para ${period}; revisa calidad documental y periodo.`
            : `Indicador propio para ${period}; no es una calificacion crediticia.`,
      status: statusBy(financialHealthScore, (n) => n >= 80, (n) => n >= 60),
      availability: scoreAvailability,
    },
    {
      label: 'Flujo mensual',
      value: hasPeriodData ? mxn(cashFlow) : 'Sin datos',
      helper: netIncomeBase > 0 ? `${pct(monthlyCashFlowMargin)} del ingreso neto.` : 'Captura ingreso neto para calcular margen.',
      status: statusBy(monthlyCashFlowMargin, (n) => n >= 0.15, (n) => n >= 0),
      availability: hasPeriodData && netIncomeBase > 0 ? 'ready' : 'limited',
    },
    {
      label: 'Runway liquido',
      value: Number.isFinite(runwayMonths) ? runwayMonths > 36 ? '>36 meses' : `${runwayMonths.toFixed(1)} meses` : 'Sin datos',
      helper: Number.isFinite(runwayMonths)
        ? `${mxn(liquidCash)} contra gastos esenciales.${isHistoricalPeriod ? ' Saldo histórico documentado; confirma cobertura de todas las cuentas.' : ''}`
        : 'Requiere gastos esenciales y saldos históricos confiables.',
      status: statusBy(runwayMonths, (n) => n >= 6, (n) => n >= 3),
      availability: Number.isFinite(runwayMonths) ? (isHistoricalPeriod ? 'limited' : 'ready') : 'unavailable',
    },
    {
      label: 'Uso de tarjeta',
      value: Number.isFinite(creditUtilization) ? pct(creditUtilization) : 'Sin datos',
      helper: Number.isFinite(creditUtilization)
        ? `Balance de tarjeta sobre limite disponible.${isHistoricalPeriod ? ' Valores históricos documentados; confirma cobertura de todas las tarjetas.' : ''}`
        : 'Captura saldo y limite de tarjeta para calcularlo.',
      status: statusBy(creditUtilization, (n) => n < 0.3, (n) => n < 0.5),
      availability: Number.isFinite(creditUtilization) ? (isHistoricalPeriod ? 'limited' : 'ready') : 'unavailable',
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
    budgetProgress,
    cashFlowForecast,
    goalReadiness,
    isHistoricalPeriod,
    dataWarnings,
  }
}
