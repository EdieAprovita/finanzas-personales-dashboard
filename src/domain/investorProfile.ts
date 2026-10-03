export type InvestmentObjective = 'preserve_capital' | 'grow_wealth' | 'passive_income'
export type IncomeStability = 'stable_diversified' | 'stable' | 'variable'
export type DrawdownResponse = 'sell' | 'wait' | 'buy_more'
export type InvestmentExperience = 'none' | 'basic' | 'experienced'
export type LiquidityNeed = 'none' | 'partial' | 'substantial'
export type EducationalRiskBand = 'conservador' | 'moderado' | 'agresivo'

export interface InvestorProfileAnswers {
  ageYears: number
  horizonYears: number
  objective: InvestmentObjective
  emergencyFundMonths: number
  hasHighInterestDebt: boolean
  incomeStability: IncomeStability
  investmentShareOfNetWorth: number
  drawdownResponse: DrawdownResponse
  maxAnnualLossPercent: number
  experience: InvestmentExperience
  liquidityNeed: LiquidityNeed
}

export interface InvestorEducationAssessment {
  capacity: EducationalRiskBand
  tolerance: EducationalRiskBand
  educationalProfile: EducationalRiskBand
  readinessNotes: string[]
  explanation: string
  allocationReference: {
    fixedIncome: number
    equities: number
    realEstate: number
  }
  firstStep: string
}

const riskRank: Record<EducationalRiskBand, number> = {
  conservador: 0,
  moderado: 1,
  agresivo: 2,
}

function riskBandFromScore(score: number, moderateAt: number, aggressiveAt: number): EducationalRiskBand {
  if (score >= aggressiveAt) return 'agresivo'
  if (score >= moderateAt) return 'moderado'
  return 'conservador'
}

/**
 * Produces an explainable educational self-assessment. It does not select
 * products, execute transactions, or provide regulated advice.
 */
export function assessInvestorEducation(answers: InvestorProfileAnswers): InvestorEducationAssessment {
  let capacityScore = 0

  if (answers.horizonYears >= 10) capacityScore += 2
  else if (answers.horizonYears >= 5) capacityScore += 1

  if (answers.emergencyFundMonths >= 6) capacityScore += 2
  else if (answers.emergencyFundMonths >= 3) capacityScore += 1

  if (!answers.hasHighInterestDebt) capacityScore += 1

  if (answers.incomeStability === 'stable_diversified') capacityScore += 2
  else if (answers.incomeStability === 'stable') capacityScore += 1

  if (answers.liquidityNeed === 'none') capacityScore += 1
  else if (answers.liquidityNeed === 'substantial') capacityScore -= 1

  const capacity = riskBandFromScore(capacityScore, 3, 6)

  let toleranceScore = 0
  if (answers.drawdownResponse === 'buy_more') toleranceScore += 2
  else if (answers.drawdownResponse === 'wait') toleranceScore += 1

  if (answers.maxAnnualLossPercent >= 25) toleranceScore += 2
  else if (answers.maxAnnualLossPercent >= 10) toleranceScore += 1

  if (answers.experience === 'experienced') toleranceScore += 1
  const tolerance = riskBandFromScore(toleranceScore, 2, 4)

  const educationalProfile = riskRank[capacity] <= riskRank[tolerance] ? capacity : tolerance
  const readinessNotes: string[] = []

  if (answers.emergencyFundMonths < 3) {
    readinessNotes.push('La reserva de emergencia declarada es menor a tres meses de gastos.')
  }
  if (answers.hasHighInterestDebt) {
    readinessNotes.push('Reportaste deuda de alto interés; conviene entender su costo antes de asumir más riesgo.')
  }
  if (answers.liquidityNeed === 'substantial') {
    readinessNotes.push('Necesitas una parte importante del dinero durante el horizonte indicado.')
  }
  if (answers.investmentShareOfNetWorth > 50) {
    readinessNotes.push('El monto a invertir representa más de la mitad de tu patrimonio declarado.')
  }

  const explanation = `Tu capacidad es ${capacity} y tu tolerancia emocional es ${tolerance}. ` +
    `La autoevaluación educativa usa ${educationalProfile}, el nivel más prudente entre ambas.`

  const allocationReference = educationalProfile === 'conservador'
    ? { fixedIncome: 70, equities: 20, realEstate: 10 }
    : educationalProfile === 'moderado'
      ? { fixedIncome: 45, equities: 45, realEstate: 10 }
      : { fixedIncome: 20, equities: 70, realEstate: 10 }
  const firstStep = answers.hasHighInterestDebt
    ? 'Define un plan para reducir primero la deuda de alto interés y confirma su costo efectivo anual.'
    : answers.emergencyFundMonths < 3
      ? 'Prioriza construir al menos tres meses de gastos esenciales líquidos antes de asumir riesgo de mercado.'
      : 'Define un aporte mensual automatizable y verifica costos, liquidez e impuestos de las alternativas disponibles en tu país.'

  return { capacity, tolerance, educationalProfile, readinessNotes, explanation, allocationReference, firstStep }
}
