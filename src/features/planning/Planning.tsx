import { Plus, Target } from 'lucide-react'
import { mxn, pct, type FinancialMetrics } from '../../domain/finance'
import { statusLabel } from '../../domain/status'
import type { FinancialProfile } from '../../domain/types'
import { goalIcons, goalTypeLabels } from '../goals/goalFormModel'

export function Planning({
  profile,
  metrics,
  onCreateGoal,
}: {
  profile: FinancialProfile
  metrics: FinancialMetrics
  onCreateGoal: () => void
}) {
  const hasGoals = profile.goals.length > 0
  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <h2>Metas y planeacion</h2>
          <p>Compara cada meta contra su fecha, aportacion mensual y capacidad real de ahorro.</p>
        </div>
        <button type="button" className="ghost primary" onClick={onCreateGoal}>
          <Plus size={18} /> Nueva meta
        </button>
      </div>

      <div className="goal-summary-grid">
        <article>
          <span>Plan cubierto</span>
          <strong>{hasGoals ? pct(metrics.goalOnTrackRatio) : 'Sin metas'}</strong>
          <small>Aporte planeado contra mensualidad requerida.</small>
        </article>
        <article>
          <span>Capacidad mensual</span>
          <strong>{metrics.goalMonthlyCapacity > 0 ? mxn(metrics.goalMonthlyCapacity) : 'Sin datos'}</strong>
          <small>Promedio de ahorro reciente disponible para metas.</small>
        </article>
        <article>
          <span>Carga de metas</span>
          <strong>{metrics.goalMonthlyRequired > 0 ? mxn(metrics.goalMonthlyRequired) : '$0'}</strong>
          <small>{Number.isFinite(metrics.goalLoadRatio) ? `${pct(metrics.goalLoadRatio)} de capacidad` : 'Captura ahorro mensual.'}</small>
        </article>
      </div>

      {!hasGoals && (
        <div className="empty-goals">
          <div className="empty-profile-icon">
            <Target size={24} />
          </div>
          <div>
            <h3>Aun no tienes metas en este perfil</h3>
            <p>Crea una meta de emergencia, ahorro, viaje, compra, inmueble, auto o deuda para ver si el plan mensual alcanza.</p>
          </div>
          <button type="button" className="action-button" onClick={onCreateGoal}>
            <Plus size={18} /> Crear primera meta
          </button>
        </div>
      )}

      {hasGoals && (
        <div className="goal-list">
          {metrics.goalReadiness.map(
            ({
              goal,
              monthsLeft,
              remainingAmount,
              progressRatio,
              requiredMonthly,
              plannedCoverageRatio,
              capacityUtilizationRatio,
              status,
              isComplete,
              isOverdue,
              warnings,
            }) => {
              const Icon = goalIcons[goal.type]
              return (
                <article className={`goal-row ${status}`} key={goal.id}>
                  <div className="goal-icon">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3>{goal.name}</h3>
                    <p>
                      {goalTypeLabels[goal.type]} · objetivo {mxn(goal.targetAmount)} · faltan {monthsLeft} mes(es).
                    </p>
                  </div>
                  <div className="goal-progress">
                    <span style={{ width: `${Math.round(progressRatio * 100)}%` }} />
                  </div>
                  <div className="goal-numbers">
                    <strong>{isComplete ? 'Completada' : `${mxn(requiredMonthly)} / mes`}</strong>
                    <span>
                      Faltan {mxn(remainingAmount)} · plan cubre {pct(plannedCoverageRatio)} · usa {pct(capacityUtilizationRatio)}
                    </span>
                  </div>
                  <small>
                    {isOverdue ? 'Vencida' : statusLabel(status)}
                    {goal.evidenceUrl && (
                      <>
                        {' · '}
                        <a href={goal.evidenceUrl} target="_blank" rel="noreferrer">
                          fuente
                        </a>
                      </>
                    )}
                  </small>
                  {warnings.length > 0 && <em>{warnings.join(' ')}</em>}
                </article>
              )
            },
          )}
        </div>
      )}
    </section>
  )
}
