import { Banknote, Car, Home, PackageCheck, PiggyBank, Plane, ShieldCheck, ShoppingBag } from 'lucide-react'
import type { Goal, GoalType } from '../../domain/types'

export const goalIcons: Record<GoalType, typeof Plane> = {
  savings: PiggyBank,
  travel: Plane,
  small_purchase: ShoppingBag,
  large_purchase: PackageCheck,
  home: Home,
  vehicle: Car,
  emergency: ShieldCheck,
  debt: Banknote,
}

export const goalTypeLabels: Record<GoalType, string> = {
  savings: 'Ahorro libre',
  travel: 'Viaje',
  small_purchase: 'Compra pequeña',
  large_purchase: 'Compra grande',
  home: 'Enganche inmueble',
  vehicle: 'Auto',
  emergency: 'Emergencia',
  debt: 'Pago de deuda',
}

export const goalTypeHelpers: Record<GoalType, string> = {
  savings: 'Ahorro flexible para inversion futura o reserva personal.',
  travel: 'Presupuesto total del viaje y fecha de salida.',
  small_purchase: 'Compra de corto plazo sin mezclarla con gastos del mes.',
  large_purchase: 'Compra grande que debe competir contra tu capacidad mensual.',
  home: 'Enganche, escrituracion y gastos iniciales, no el valor total del inmueble.',
  vehicle: 'Ahorro para enganche o compra de contado.',
  emergency: 'Reserva para cubrir meses de gastos esenciales.',
  debt: 'Plan para liquidar deuda o juntar pagos extra.',
}

export type GoalFormState = {
  name: string
  type: GoalType
  targetAmount: string
  currentSaved: string
  targetDate: string
  plannedMonthlyContribution: string
  priority: 'high' | 'medium' | 'low'
  targetCoverageMonths: string
}

export function defaultGoalForm(type: GoalType = 'savings', asOfDate: string): GoalFormState {
  return {
    name: '',
    type,
    targetAmount: '',
    currentSaved: '',
    targetDate: `${Number(asOfDate.slice(0, 4)) + 1}-12-01`,
    plannedMonthlyContribution: '',
    priority: 'medium',
    targetCoverageMonths: type === 'emergency' ? '6' : '',
  }
}

function monthsUntil(targetDate: string, asOfDate: string) {
  const target = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return 0
  const now = new Date(`${asOfDate.slice(0, 10)}T00:00:00`)
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth())
}

export function validateGoalForm(goal: GoalFormState, asOfDate: string) {
  const targetAmount = Number(goal.targetAmount)
  const currentSaved = Number(goal.currentSaved || 0)
  const plannedMonthlyContribution = Number(goal.plannedMonthlyContribution || 0)
  if (!goal.name.trim()) return 'Agrega un nombre para la meta.'
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return 'Agrega un objetivo mayor a cero.'
  if (!Number.isFinite(currentSaved) || currentSaved < 0) return 'El avance actual no puede ser negativo.'
  if (!Number.isFinite(plannedMonthlyContribution) || plannedMonthlyContribution < 0) return 'La aportacion mensual no puede ser negativa.'
  if (!goal.targetDate || Number.isNaN(new Date(`${goal.targetDate}T00:00:00`).getTime())) return 'Selecciona una fecha objetivo valida.'
  if (monthsUntil(goal.targetDate, asOfDate) === 0 && currentSaved < targetAmount) return 'La fecha objetivo debe ser futura si aun falta dinero.'
  return ''
}

export function goalFormToGoal(goal: GoalFormState, timestamp: string): Goal {
  return {
    id: `goal-${Date.now()}`,
    name: goal.name.trim(),
    type: goal.type,
    targetAmount: Number(goal.targetAmount),
    currentSaved: Number(goal.currentSaved || 0),
    targetDate: goal.targetDate,
    plannedMonthlyContribution: Number(goal.plannedMonthlyContribution || 0),
    currency: 'MXN',
    priority: goal.priority,
    targetCoverageMonths: goal.type === 'emergency' && goal.targetCoverageMonths ? Number(goal.targetCoverageMonths) : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function goalFormEstimate(goal: GoalFormState, asOfDate: string) {
  const targetAmount = Number(goal.targetAmount)
  const currentSaved = Number(goal.currentSaved || 0)
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return null
  const remaining = Math.max(0, targetAmount - currentSaved)
  const months = Math.max(1, monthsUntil(goal.targetDate, asOfDate))
  return {
    remaining,
    months,
    requiredMonthly: remaining / months,
  }
}
