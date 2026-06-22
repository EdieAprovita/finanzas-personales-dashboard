import { mxn } from '../../domain/finance'
import type { GoalType } from '../../domain/types'
import { goalFormEstimate, goalIcons, goalTypeHelpers, goalTypeLabels, type GoalFormState } from './goalFormModel'

export function GoalForm({
  goal,
  error,
  compact = false,
  onChange,
}: {
  goal: GoalFormState
  error?: string
  compact?: boolean
  onChange: (goal: GoalFormState) => void
}) {
  const estimate = goalFormEstimate(goal)
  const typeOptions: GoalType[] = ['emergency', 'savings', 'travel', 'small_purchase', 'large_purchase', 'home', 'vehicle', 'debt']

  function update(next: Partial<GoalFormState>) {
    const nextGoal = { ...goal, ...next }
    if (next.type && next.type !== goal.type) {
      nextGoal.targetCoverageMonths = next.type === 'emergency' ? goal.targetCoverageMonths || '6' : ''
      if (!goal.name.trim()) nextGoal.name = goalTypeLabels[next.type]
    }
    onChange(nextGoal)
  }

  return (
    <div className={`goal-form ${compact ? 'compact' : ''}`}>
      <div className="goal-type-grid" role="list" aria-label="Tipo de meta">
        {typeOptions.map((type) => {
          const Icon = goalIcons[type]
          return (
            <button
              type="button"
              className={`goal-type-chip ${goal.type === type ? 'active' : ''}`}
              key={type}
              onClick={() => update({ type })}
            >
              <Icon size={17} />
              <span>{goalTypeLabels[type]}</span>
            </button>
          )
        })}
      </div>
      <p className="goal-helper">{goalTypeHelpers[goal.type]}</p>
      <div className="form-grid goals">
        <label>
          Nombre
          <input value={goal.name} onChange={(event) => update({ name: event.target.value })} placeholder="Fondo emergencia 6 meses" />
        </label>
        <label>
          Prioridad
          <select value={goal.priority} onChange={(event) => update({ priority: event.target.value as GoalFormState['priority'] })}>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </label>
        <label>
          {goal.type === 'home' || goal.type === 'vehicle' ? 'Enganche / objetivo' : 'Monto objetivo'}
          <input inputMode="decimal" value={goal.targetAmount} onChange={(event) => update({ targetAmount: event.target.value })} placeholder="180000" />
        </label>
        <label>
          {goal.type === 'debt' ? 'Pago reservado' : 'Ya tengo'}
          <input inputMode="decimal" value={goal.currentSaved} onChange={(event) => update({ currentSaved: event.target.value })} placeholder="45000" />
        </label>
        <label>
          {goal.type === 'travel' ? 'Fecha de salida' : 'Fecha objetivo'}
          <input type="date" value={goal.targetDate} onChange={(event) => update({ targetDate: event.target.value })} />
        </label>
        <label>
          Aportacion mensual planeada
          <input
            inputMode="decimal"
            value={goal.plannedMonthlyContribution}
            onChange={(event) => update({ plannedMonthlyContribution: event.target.value })}
            placeholder={estimate ? String(Math.ceil(estimate.requiredMonthly)) : '7500'}
          />
        </label>
        {goal.type === 'emergency' && (
          <label>
            Cobertura objetivo
            <select value={goal.targetCoverageMonths} onChange={(event) => update({ targetCoverageMonths: event.target.value })}>
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="9">9 meses</option>
              <option value="12">12 meses</option>
            </select>
          </label>
        )}
      </div>
      {estimate && (
        <div className="goal-estimate">
          <span>Faltan {mxn(estimate.remaining)}</span>
          <strong>{mxn(estimate.requiredMonthly)} / mes</strong>
          <small>Estimado a {estimate.months} mes(es) para llegar a la fecha.</small>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
