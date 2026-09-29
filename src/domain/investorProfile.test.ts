import { describe, expect, it } from 'vitest'
import { assessInvestorEducation, type InvestorProfileAnswers } from './investorProfile'

function answers(overrides: Partial<InvestorProfileAnswers> = {}): InvestorProfileAnswers {
  return {
    ageYears: 35,
    horizonYears: 12,
    objective: 'grow_wealth',
    emergencyFundMonths: 6,
    hasHighInterestDebt: false,
    incomeStability: 'stable_diversified',
    investmentShareOfNetWorth: 20,
    drawdownResponse: 'buy_more',
    maxAnnualLossPercent: 30,
    experience: 'experienced',
    liquidityNeed: 'none',
    ...overrides,
  }
}

describe('assessInvestorEducation', () => {
  it('uses the lower of capacity and emotional tolerance', () => {
    const result = assessInvestorEducation(answers({ drawdownResponse: 'sell', maxAnnualLossPercent: 5, experience: 'none' }))

    expect(result.capacity).toBe('agresivo')
    expect(result.tolerance).toBe('conservador')
    expect(result.educationalProfile).toBe('conservador')
    expect(result.allocationReference).toEqual({ fixedIncome: 70, equities: 20, realEstate: 10 })
  })

  it('flags readiness constraints without producing an investment recommendation', () => {
    const result = assessInvestorEducation(answers({
      emergencyFundMonths: 1,
      hasHighInterestDebt: true,
      liquidityNeed: 'substantial',
      investmentShareOfNetWorth: 60,
    }))

    expect(result.readinessNotes).toEqual(expect.arrayContaining([
      expect.stringMatching(/emergencia/i),
      expect.stringMatching(/alto interés/i),
      expect.stringMatching(/importante/i),
      expect.stringMatching(/mitad/i),
    ]))
    expect(result.explanation).toContain('autoevaluación educativa')
    expect(result.firstStep).toMatch(/deuda de alto interés/i)
  })
})
