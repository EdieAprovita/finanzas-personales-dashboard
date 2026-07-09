import { PROFILE_SCHEMA_VERSION, type FinancialProfile, type MonthlySnapshot, type Transaction } from './types'

const categories = ['Vivienda', 'Supermercado', 'Transporte', 'Restaurantes', 'Salud', 'Viajes', 'Suscripciones']

function snapshots(seed: number, pressure = 0): MonthlySnapshot[] {
  const months = [
    '2025-07',
    '2025-08',
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
  ]

  return months.map((month, index) => {
    const income = seed + (index === 5 ? 28000 : 0) + (index % 4 === 0 ? 5000 : 0)
    const expenses = Math.round(seed * (0.52 + pressure) + index * 420 + (index === 8 ? 18000 : 0))
    const debtPayments = Math.round(seed * (0.08 + pressure / 2))
    const savings = Math.max(0, income - expenses - debtPayments)

    return {
      month,
      income,
      expenses,
      debtPayments,
      savings,
      netWorth: 320000 + index * (savings - debtPayments / 2) + seed * 2,
    }
  })
}

function transactions(profileId: string, baseIncome: number, pressure = 0): Transaction[] {
  const currentMonth = '2026-06'
  const rows: Transaction[] = [
    {
      id: `${profileId}-salary`,
      date: `${currentMonth}-01`,
      amount: baseIncome,
      merchant: 'Nomina mensual',
      category: 'Ingreso',
      accountId: `${profileId}-checking`,
      type: 'income',
      isRecurring: true,
    },
  ]

  categories.forEach((category, index) => {
    const essential = ['Vivienda', 'Supermercado', 'Transporte', 'Salud'].includes(category)
    rows.push({
      id: `${profileId}-tx-${index}`,
      date: `${currentMonth}-${String(index + 3).padStart(2, '0')}`,
      amount: -Math.round((index + 2) * 1450 * (essential ? 1.4 : 1 + pressure)),
      merchant: category === 'Vivienda' ? 'Renta / hipoteca' : `Gasto ${category}`,
      category,
      accountId: `${profileId}-checking`,
      type: 'expense',
      isRecurring: essential,
      isEssential: essential,
    })
  })

  return rows
}

const exampleProfileData = [
  {
    id: 'healthy_saver',
    name: 'Ahorro saludable',
    description: 'Flujo positivo, deuda baja y fondo de emergencia robusto.',
    grossMonthlyIncome: 98000,
    netMonthlyIncome: 74000,
    accounts: [
      { id: 'healthy_saver-checking', name: 'Cuenta nomina', type: 'checking', balance: 42000, currency: 'MXN' },
      { id: 'healthy_saver-savings', name: 'Fondo emergencia', type: 'savings', balance: 312000, currency: 'MXN' },
      { id: 'healthy_saver-invest', name: 'Inversiones', type: 'investment', balance: 420000, currency: 'MXN' },
      { id: 'healthy_saver-card', name: 'Tarjeta principal', type: 'credit_card', balance: -18500, currency: 'MXN', creditLimit: 160000 },
    ],
    transactions: transactions('healthy_saver', 74000),
    debts: [{ id: 'healthy_saver-card-debt', name: 'Tarjeta principal', balance: 18500, apr: 0.39, minimumPayment: 2200, creditLimit: 160000, dueDate: '2026-07-11' }],
    goals: [
      { id: 'trip-jp', name: 'Viaje Japon', type: 'travel', targetAmount: 120000, currentSaved: 54000, targetDate: '2027-03-01', plannedMonthlyContribution: 9000 },
      { id: 'emergency', name: 'Fondo 9 meses', type: 'emergency', targetAmount: 405000, currentSaved: 312000, targetDate: '2026-12-01', plannedMonthlyContribution: 12000 },
    ],
    budgets: categories.map((category, index) => ({ category, monthlyLimit: 6000 + index * 2200 })),
    monthlySnapshots: snapshots(74000),
    importedDocuments: [],
  },
  {
    id: 'card_debt_pressure',
    name: 'Presion de tarjeta',
    description: 'Utilizacion alta, intereses caros y flujo apenas positivo.',
    grossMonthlyIncome: 72000,
    netMonthlyIncome: 54000,
    accounts: [
      { id: 'card_debt_pressure-checking', name: 'Cuenta nomina', type: 'checking', balance: 14000, currency: 'MXN' },
      { id: 'card_debt_pressure-savings', name: 'Ahorro liquido', type: 'savings', balance: 48000, currency: 'MXN' },
      { id: 'card_debt_pressure-card', name: 'Tarjeta oro', type: 'credit_card', balance: -126000, currency: 'MXN', creditLimit: 170000 },
    ],
    transactions: transactions('card_debt_pressure', 54000, 0.18),
    debts: [{ id: 'card_debt_pressure-card-debt', name: 'Tarjeta oro', balance: 126000, apr: 0.58, minimumPayment: 7600, creditLimit: 170000, dueDate: '2026-07-07' }],
    goals: [
      { id: 'card-payoff', name: 'Liquidar tarjeta', type: 'debt', targetAmount: 126000, currentSaved: 12000, targetDate: '2027-06-01', plannedMonthlyContribution: 9500 },
      { id: 'beach-trip', name: 'Viaje familiar', type: 'travel', targetAmount: 68000, currentSaved: 8000, targetDate: '2026-12-15', plannedMonthlyContribution: 4000 },
    ],
    budgets: categories.map((category, index) => ({ category, monthlyLimit: 4200 + index * 1800 })),
    monthlySnapshots: snapshots(54000, 0.2),
    importedDocuments: [],
  },
  {
    id: 'irregular_income_freelancer',
    name: 'Freelance variable',
    description: 'Ingresos volatiles; la liquidez manda mas que el promedio.',
    grossMonthlyIncome: 88000,
    netMonthlyIncome: 69000,
    accounts: [
      { id: 'irregular_income_freelancer-checking', name: 'Cuenta operativa', type: 'checking', balance: 62000, currency: 'MXN' },
      { id: 'irregular_income_freelancer-savings', name: 'Reserva impuestos', type: 'savings', balance: 176000, currency: 'MXN' },
      { id: 'irregular_income_freelancer-invest', name: 'ETF global', type: 'investment', balance: 210000, currency: 'MXN' },
    ],
    transactions: transactions('irregular_income_freelancer', 69000, 0.04),
    debts: [{ id: 'irregular_income_freelancer-auto', name: 'Credito auto', balance: 188000, apr: 0.16, minimumPayment: 7200, dueDate: '2026-07-20' }],
    goals: [
      { id: 'tax-buffer', name: 'Reserva impuestos', type: 'emergency', targetAmount: 220000, currentSaved: 176000, targetDate: '2026-11-01', plannedMonthlyContribution: 9000 },
      { id: 'new-laptop', name: 'Equipo de trabajo', type: 'large_purchase', targetAmount: 74000, currentSaved: 26000, targetDate: '2026-10-01', plannedMonthlyContribution: 8000 },
    ],
    budgets: categories.map((category, index) => ({ category, monthlyLimit: 5000 + index * 1800 })),
    monthlySnapshots: snapshots(69000, 0.06).map((row, index) => ({
      ...row,
      income: index % 3 === 0 ? row.income * 0.58 : row.income * 1.18,
    })),
    importedDocuments: [],
  },
  {
    id: 'big_goal_planner',
    name: 'Metas grandes',
    description: 'Viaje, auto e inmueble compiten por la misma capacidad de ahorro.',
    grossMonthlyIncome: 132000,
    netMonthlyIncome: 99000,
    accounts: [
      { id: 'big_goal_planner-checking', name: 'Cuenta nomina', type: 'checking', balance: 52000, currency: 'MXN' },
      { id: 'big_goal_planner-savings', name: 'Enganche inmueble', type: 'savings', balance: 410000, currency: 'MXN' },
      { id: 'big_goal_planner-invest', name: 'Inversiones largo plazo', type: 'investment', balance: 620000, currency: 'MXN' },
      { id: 'big_goal_planner-card', name: 'Tarjeta viajes', type: 'credit_card', balance: -42000, currency: 'MXN', creditLimit: 220000 },
    ],
    transactions: transactions('big_goal_planner', 99000, 0.08),
    debts: [{ id: 'big_goal_planner-card-debt', name: 'Tarjeta viajes', balance: 42000, apr: 0.34, minimumPayment: 3600, creditLimit: 220000, dueDate: '2026-07-05' }],
    goals: [
      { id: 'home-downpayment', name: 'Enganche departamento', type: 'home', targetAmount: 950000, currentSaved: 410000, targetDate: '2028-01-01', plannedMonthlyContribution: 23000 },
      { id: 'new-car', name: 'Auto hibrido', type: 'vehicle', targetAmount: 380000, currentSaved: 78000, targetDate: '2027-07-01', plannedMonthlyContribution: 12000 },
      { id: 'italy-trip', name: 'Viaje Italia', type: 'travel', targetAmount: 145000, currentSaved: 38000, targetDate: '2027-05-01', plannedMonthlyContribution: 8500 },
      {
        id: 'emergency-six-months-documented',
        name: 'Fondo emergencia 6 meses',
        type: 'emergency',
        targetAmount: 182700,
        currentSaved: 95000,
        targetDate: '2027-03-01',
        plannedMonthlyContribution: 11000,
        priority: 'high',
        targetCoverageMonths: 6,
        evidenceLabel: 'CFPB Your Money, Your Goals',
        evidenceUrl: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/',
        notes: 'Meta ficticia de prueba: usa una reserva de emergencia basada en meses de gasto esencial para validar progreso, mensualidad requerida y carga contra capacidad.',
      },
    ],
    budgets: categories.map((category, index) => ({ category, monthlyLimit: 7000 + index * 2600 })),
    monthlySnapshots: snapshots(99000, 0.08),
    importedDocuments: [],
  },
] satisfies Omit<FinancialProfile, 'schemaVersion' | 'reportingCurrency'>[]

export const exampleProfiles: FinancialProfile[] = exampleProfileData.map((profile) => ({
  ...profile,
  schemaVersion: PROFILE_SCHEMA_VERSION,
  reportingCurrency: 'MXN',
  debts: profile.debts.map((debt) => ({
    ...debt,
    accountId: debt.id.endsWith('-debt') ? debt.id.slice(0, -'-debt'.length) : undefined,
    currency: 'MXN',
  })),
}))
