import { useMemo, useState, type ReactNode } from 'react'
import { Calculator, CircleAlert } from 'lucide-react'
import { recommendDebtStrategy, type DebtStrategyGoal, type SimulatedDebt } from '../../domain/debtSimulator'

const exampleDebts: SimulatedDebt[] = [
  { id: 'home', name: 'Crédito de vivienda', principal: 25000, annualEffectiveRate: 0.1, termMonths: 120, paymentsMade: 24 },
  { id: 'consumer', name: 'Crédito de consumo', principal: 2000, annualEffectiveRate: 0.18, termMonths: 60, paymentsMade: 36 },
  { id: 'card', name: 'Tarjeta de crédito', principal: 1000, annualEffectiveRate: 0.3, termMonths: 36, paymentsMade: 2 },
]

const goalLabels: Record<DebtStrategyGoal, string> = {
  cashflow_3m: 'Liberar flujo en 3 meses',
  cashflow_12m: 'Liberar flujo en 12 meses',
  lowest_interest: 'Pagar menos intereses',
}

function usd(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function DebtSimulator(): ReactNode {
  const [extraPayment, setExtraPayment] = useState('100')
  const [goal, setGoal] = useState<DebtStrategyGoal>('lowest_interest')
  const extra = Number(extraPayment)
  const result = useMemo(
    () => recommendDebtStrategy(exampleDebts, Number.isFinite(extra) && extra >= 0 ? extra : 0, goal),
    [extra, goal],
  )
  const debtNames = new Map(exampleDebts.map((debt) => [debt.id, debt.name]))
  const reasoning =
    goal === 'lowest_interest'
      ? 'Prioriza la tasa efectiva anual más alta para reducir el costo financiero dentro de este escenario.'
      : result.freedMonthlyPaymentAtHorizon > 0
        ? `Es la secuencia que libera más cuotas contractuales antes del horizonte elegido entre las alternativas modeladas.`
        : `Con el abono disponible no se liquida una deuda completa dentro del horizonte; se muestra la secuencia con menor costo entre las alternativas modeladas.`

  return (
    <section className="panel wide debt-simulator">
      <div className="panel-heading">
        <div>
          <h2>Simulador de prioridad de deuda</h2>
          <p>Ejemplo educativo en USD con cuota fija y prepago que reduce plazo, no cuota.</p>
        </div>
        <Calculator size={24} />
      </div>
      <div className="form-grid debt-simulator-controls">
        <label>
          Abono extra mensual (USD)
          <input inputMode="decimal" min="0" type="number" value={extraPayment} onChange={(event) => setExtraPayment(event.target.value)} />
        </label>
        <label>
          Objetivo
          <select value={goal} onChange={(event) => setGoal(event.target.value as DebtStrategyGoal)}>
            {Object.entries(goalLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="goal-summary-grid" aria-label="Resultado del simulador de deuda">
        <article>
          <span>Orden recomendado</span>
          <strong>{result.recommendedOrder.map((id) => debtNames.get(id)).join(' → ')}</strong>
          <small>{reasoning}</small>
        </article>
        <article>
          <span>Intereses modelados</span>
          <strong>{usd(result.totalInterest)}</strong>
          <small>Sin cargos nuevos ni cambios de tasa.</small>
        </article>
        <article>
          <span>Flujo liberado al horizonte</span>
          <strong>{usd(result.freedMonthlyPaymentAtHorizon)} / mes</strong>
          <small>{goal === 'lowest_interest' ? 'No es el criterio usado para recomendar.' : goalLabels[goal]}.</small>
        </article>
      </div>
      <div className="document-detail-scroll">
        <table>
          <thead>
            <tr><th>Deuda</th><th>Saldo estimado</th><th>Cuota</th><th>Mes de liquidación</th><th>Intereses</th></tr>
          </thead>
          <tbody>
            {result.summaries.map((summary) => (
              <tr key={summary.id}>
                <td>{summary.name}</td><td>{usd(summary.startingBalance)}</td><td>{usd(summary.contractualPayment)}</td><td>{summary.payoffMonth ?? 'Más de 100 años'}</td><td>{usd(summary.interestPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="debt-simulator-note"><CircleAlert size={16} /> Educación financiera, no asesoría personalizada ni una oferta de crédito. Confirma con tu banco si un prepago reduce cuota o plazo.</p>
    </section>
  )
}
