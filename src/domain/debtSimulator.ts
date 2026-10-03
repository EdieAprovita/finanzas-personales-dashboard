export type DebtStrategyGoal = 'cashflow_3m' | 'cashflow_12m' | 'lowest_interest'

export interface SimulatedDebt {
  id: string
  name: string
  principal: number
  annualEffectiveRate: number
  termMonths: number
  paymentsMade: number
}

export interface DebtPayoffSummary {
  id: string
  name: string
  startingBalance: number
  contractualPayment: number
  payoffMonth: number | null
  interestPaid: number
}

export interface DebtStrategyResult {
  goal: DebtStrategyGoal
  recommendedOrder: string[]
  totalInterest: number
  monthsToPayoff: number | null
  freedMonthlyPaymentAtHorizon: number
  summaries: DebtPayoffSummary[]
}

interface DebtRuntime {
  debt: SimulatedDebt
  balance: number
  contractualPayment: number
  interestPaid: number
  payoffMonth: number | null
}

const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export function monthlyRateFromEffectiveAnnual(annualEffectiveRate: number): number {
  if (!Number.isFinite(annualEffectiveRate) || annualEffectiveRate < 0) {
    throw new Error('La tasa efectiva anual debe ser un número no negativo.')
  }
  return Math.expm1(Math.log1p(annualEffectiveRate) / 12)
}

export function contractualPayment(debt: SimulatedDebt): number {
  if (!Number.isFinite(debt.principal) || debt.principal <= 0 || !Number.isInteger(debt.termMonths) || debt.termMonths <= 0) {
    throw new Error('El crédito requiere monto inicial y plazo válidos.')
  }
  const rate = monthlyRateFromEffectiveAnnual(debt.annualEffectiveRate)
  if (rate === 0) return cents(debt.principal / debt.termMonths)
  return cents((debt.principal * rate) / (1 - (1 + rate) ** -debt.termMonths))
}

export function outstandingBalance(debt: SimulatedDebt): number {
  if (!Number.isInteger(debt.paymentsMade) || debt.paymentsMade < 0 || debt.paymentsMade > debt.termMonths) {
    throw new Error('Las cuotas pagadas deben estar entre cero y el plazo del crédito.')
  }
  const payment = contractualPayment(debt)
  const rate = monthlyRateFromEffectiveAnnual(debt.annualEffectiveRate)
  let balance = debt.principal
  for (let month = 0; month < debt.paymentsMade && balance > 0; month += 1) {
    const interest = cents(balance * rate)
    balance = cents(Math.max(0, balance + interest - payment))
  }
  return balance
}

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) return [values]
  return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]))
}

function createRuntime(debt: SimulatedDebt): DebtRuntime {
  return {
    debt,
    balance: outstandingBalance(debt),
    contractualPayment: contractualPayment(debt),
    interestPaid: 0,
    payoffMonth: null,
  }
}

function simulateOrder(
  debts: SimulatedDebt[],
  extraPayment: number,
  order: string[],
  goal: DebtStrategyGoal,
): DebtStrategyResult {
  const runtimes = debts.map(createRuntime)
  const horizon = goal === 'cashflow_3m' ? 3 : goal === 'cashflow_12m' ? 12 : 0
  const monthlyExtra = cents(Math.max(0, extraPayment))
  let month = 0

  while (runtimes.some((runtime) => runtime.balance > 0) && month < 1200) {
    month += 1
    for (const runtime of runtimes) {
      if (runtime.balance <= 0) continue
      const interest = cents(runtime.balance * monthlyRateFromEffectiveAnnual(runtime.debt.annualEffectiveRate))
      runtime.interestPaid = cents(runtime.interestPaid + interest)
      const scheduledPayment = Math.min(runtime.contractualPayment, runtime.balance + interest)
      runtime.balance = cents(Math.max(0, runtime.balance + interest - scheduledPayment))
      if (runtime.balance === 0 && runtime.payoffMonth === null) runtime.payoffMonth = month
    }
    let remainingExtra = monthlyExtra
    for (const debtId of order) {
      const runtime = runtimes.find((candidate) => candidate.debt.id === debtId)
      if (!runtime || runtime.balance <= 0 || remainingExtra <= 0) continue
      const payment = Math.min(remainingExtra, runtime.balance)
      runtime.balance = cents(runtime.balance - payment)
      remainingExtra = cents(remainingExtra - payment)
      if (runtime.balance === 0 && runtime.payoffMonth === null) runtime.payoffMonth = month
    }
  }

  const summaries = runtimes.map((runtime) => ({
    id: runtime.debt.id,
    name: runtime.debt.name,
    startingBalance: outstandingBalance(runtime.debt),
    contractualPayment: runtime.contractualPayment,
    payoffMonth: runtime.payoffMonth,
    interestPaid: runtime.interestPaid,
  }))
  return {
    goal,
    recommendedOrder: order,
    totalInterest: cents(summaries.reduce((sum, summary) => sum + summary.interestPaid, 0)),
    monthsToPayoff: runtimes.every((runtime) => runtime.balance === 0) ? month : null,
    freedMonthlyPaymentAtHorizon:
      horizon > 0
        ? cents(summaries.filter((summary) => summary.payoffMonth !== null && summary.payoffMonth <= horizon).reduce((sum, summary) => sum + summary.contractualPayment, 0))
        : 0,
    summaries,
  }
}

export function recommendDebtStrategy(debts: SimulatedDebt[], extraPayment: number, goal: DebtStrategyGoal): DebtStrategyResult {
  if (!debts.length) throw new Error('Agrega al menos una deuda para simular.')
  if (!Number.isFinite(extraPayment) || extraPayment < 0) throw new Error('El abono extra mensual debe ser un número no negativo.')
  const orders =
    goal === 'lowest_interest'
      ? [[...debts].sort((left, right) => right.annualEffectiveRate - left.annualEffectiveRate).map((debt) => debt.id)]
      : permutations(debts.map((debt) => debt.id))
  const results = orders.map((order) => simulateOrder(debts, extraPayment, order, goal))
  const horizon = goal === 'cashflow_3m' ? 3 : goal === 'cashflow_12m' ? 12 : 0
  return [...results].sort((left, right) => {
    if (goal === 'lowest_interest') return left.totalInterest - right.totalInterest || (left.monthsToPayoff ?? Infinity) - (right.monthsToPayoff ?? Infinity)
    return (
      right.freedMonthlyPaymentAtHorizon - left.freedMonthlyPaymentAtHorizon ||
      left.totalInterest - right.totalInterest ||
      (left.monthsToPayoff ?? Infinity) - (right.monthsToPayoff ?? Infinity) ||
      left.recommendedOrder.join('|').localeCompare(right.recommendedOrder.join('|')) ||
      horizon
    )
  })[0] ?? simulateOrder(debts, extraPayment, debts.map((debt) => debt.id), goal)
}
