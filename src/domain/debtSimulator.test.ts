import { describe, expect, it } from 'vitest'
import { contractualPayment, monthlyRateFromEffectiveAnnual, outstandingBalance, recommendDebtStrategy, type SimulatedDebt } from './debtSimulator'

const sampleDebts: SimulatedDebt[] = [
  { id: 'home', name: 'Vivienda', principal: 25000, annualEffectiveRate: 0.1, termMonths: 120, paymentsMade: 24 },
  { id: 'consumer', name: 'Consumo', principal: 2000, annualEffectiveRate: 0.18, termMonths: 60, paymentsMade: 36 },
  { id: 'card', name: 'Tarjeta', principal: 1000, annualEffectiveRate: 0.3, termMonths: 36, paymentsMade: 2 },
]

describe('debt simulator', () => {
  it('converts an effective annual rate to its effective monthly rate', () => {
    expect(monthlyRateFromEffectiveAnnual(0.1)).toBeCloseTo(0.00797414, 8)
  })

  it('calculates the contractual payment and current balance for the provided examples', () => {
    expect(contractualPayment(sampleDebts[0]!)).toBeCloseTo(324.44, 2)
    expect(outstandingBalance(sampleDebts[0]!)).toBe(21705.83)
    expect(contractualPayment(sampleDebts[1]!)).toBeCloseTo(49.35, 2)
    expect(outstandingBalance(sampleDebts[1]!)).toBe(1001.18)
  })

  it('uses the highest effective annual rate first when minimizing interest', () => {
    const result = recommendDebtStrategy(sampleDebts, 100, 'lowest_interest')

    expect(result.recommendedOrder).toEqual(['card', 'consumer', 'home'])
    expect(result.totalInterest).toBeGreaterThan(0)
    expect(result.monthsToPayoff).not.toBeNull()
  })

  it('does not report released cash before a debt is paid off', () => {
    const result = recommendDebtStrategy(sampleDebts, 0, 'cashflow_3m')

    expect(result.freedMonthlyPaymentAtHorizon).toBe(0)
  })
})
