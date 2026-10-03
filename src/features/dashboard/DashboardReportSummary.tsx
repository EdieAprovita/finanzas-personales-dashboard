import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FolderOpen,
  Gauge,
  Landmark,
} from 'lucide-react'
import type { FinancialMetrics } from '../../domain/finance'
import { monthlyCloseBlockers } from '../../domain/snapshots'
import type { FinancialProfile } from '../../domain/types'
import { statusLabel } from '../../domain/status'
import { analyzeDocumentQuality } from '../imports/documentQuality'
import { profileFacts } from '../profiles/profileSummary'

interface DashboardReportSummaryProps {
  profile: FinancialProfile
  metrics: FinancialMetrics
  periods: string[]
  reportingPeriod: string
  facts: ReturnType<typeof profileFacts>
  onReportingPeriodChange: (period: string) => void
  onCloseReportingPeriod: (balanceAsOf: string) => Promise<void>
  onCreateFromDocuments: () => void
  onOpenPlanning: () => void
}

export function DashboardReportSummary({
  profile,
  metrics,
  periods,
  reportingPeriod,
  facts,
  onReportingPeriodChange,
  onCloseReportingPeriod,
  onCreateFromDocuments,
  onOpenPlanning,
}: DashboardReportSummaryProps) {
  const documentQuality = useMemo(() => analyzeDocumentQuality(profile), [profile])
  const upcomingDueDebts = profile.debts.filter(
    (debt) =>
      debt.dueDate >= metrics.asOfDate &&
      debt.dueDate <= `${metrics.asOfDate.slice(0, 7)}-31`,
  )
  const constrainedGoals = metrics.goalReadiness.filter(
    (goal) => goal.status === 'red' && !goal.isComplete,
  )
  const snapshot = profile.monthlySnapshots.find((row) => row.month === reportingPeriod)
  const closeBlockers = useMemo(
    () => monthlyCloseBlockers(profile, reportingPeriod, metrics.asOfDate),
    [metrics.asOfDate, profile, reportingPeriod],
  )
  const isClosed = Boolean(snapshot?.reconciledAt && closeBlockers.length === 0)
  const monthEnd = `${reportingPeriod}-${String(new Date(Date.UTC(Number(reportingPeriod.slice(0, 4)), Number(reportingPeriod.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`
  const maxBalanceDate = reportingPeriod === metrics.asOfDate.slice(0, 7) ? metrics.asOfDate : monthEnd
  const [balanceAsOf, setBalanceAsOf] = useState(maxBalanceDate)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [closeMessage, setCloseMessage] = useState('')
  const [closing, setClosing] = useState(false)

  async function closePeriod() {
    if (!confirmingClose) {
      setConfirmingClose(true)
      setCloseMessage(`Confirma que revisaste los movimientos y que los saldos están actualizados al ${balanceAsOf}.`)
      return
    }
    setClosing(true)
    try {
      await onCloseReportingPeriod(balanceAsOf)
      setConfirmingClose(false)
      setCloseMessage('Cierre guardado en la base local.')
    } catch (error) {
      setCloseMessage(error instanceof Error ? error.message : 'No se pudo cerrar el periodo.')
    } finally {
      setClosing(false)
    }
  }

  return (
    <>
      <section className="panel wide dashboard-period-bar">
        <div>
          <p className="eyebrow">Periodo de reporte</p>
          <strong>{reportingPeriod}</strong>
          <span>
            {reportingPeriod === metrics.asOfDate.slice(0, 7)
              ? 'Mes en curso'
              : 'Último mes con datos'}
          </span>
        </div>
        <label>
          Ver periodo
          <select
            value={reportingPeriod}
            onChange={(event) => {
              const period = event.target.value
              const periodEnd = `${period}-${String(new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`
              setBalanceAsOf(period === metrics.asOfDate.slice(0, 7) ? metrics.asOfDate : periodEnd)
              setConfirmingClose(false)
              setCloseMessage('')
              onReportingPeriodChange(period)
            }}
          >
            {periods.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel wide monthly-close" aria-labelledby="monthly-close-title">
        <div>
          <p className="eyebrow">Conciliación</p>
          <h2 id="monthly-close-title">Cierre mensual</h2>
          {isClosed ? (
            <p className="monthly-close-status"><CheckCircle2 size={18} /> Cerrado con saldos al {snapshot?.balanceAsOf}.</p>
          ) : (
            <p>{closeBlockers.length ? closeBlockers.join(' ') : 'Revisa movimientos y confirma la fecha efectiva de tus saldos.'}</p>
          )}
        </div>
        {!isClosed && (
          <div className="monthly-close-actions">
            <label>
              Saldos actualizados al
              <input type="date" min={`${reportingPeriod}-01`} max={maxBalanceDate} value={balanceAsOf} onChange={(event) => {
                setBalanceAsOf(event.target.value)
                setConfirmingClose(false)
                setCloseMessage('')
              }} />
            </label>
            <button type="button" className="ghost primary" disabled={closing || closeBlockers.length > 0} onClick={() => void closePeriod()}>
              {closing ? 'Guardando...' : confirmingClose ? `Confirmar cierre de ${reportingPeriod}` : 'Revisar cierre mensual'}
            </button>
          </div>
        )}
        {closeMessage && <p className="profile-message" role={confirmingClose ? 'alert' : 'status'} aria-live={confirmingClose ? 'assertive' : 'polite'}>{closeMessage}</p>}
      </section>

      {metrics.excludedForeignAccountCount > 0 && (
        <section className="panel wide data-warning">
          <AlertTriangle size={18} />
          <span>
            {metrics.excludedForeignAccountCount} cuenta(s) en moneda distinta a MXN no
            se incluyen en patrimonio ni KPIs hasta capturar un tipo de cambio fechado.
          </span>
        </section>
      )}

      {(documentQuality.risk.pendingReconciliation > 0 ||
        upcomingDueDebts.length > 0 ||
        constrainedGoals.length > 0) && (
        <section className="panel wide data-warning" aria-label="Alertas accionables">
          <AlertTriangle size={18} />
          <span>
            {documentQuality.risk.pendingReconciliation > 0 &&
              `${documentQuality.risk.pendingReconciliation} documento(s) por conciliar. `}
            {upcomingDueDebts.length > 0 &&
              `Revisa fecha límite de ${upcomingDueDebts.map((debt) => debt.name).join(', ')}. `}
            {constrainedGoals.length > 0 &&
              `${constrainedGoals.length} meta(s) exceden la capacidad registrada.`}
          </span>
          {documentQuality.risk.pendingReconciliation > 0 && (
            <button type="button" className="ghost" onClick={onCreateFromDocuments}>
              Revisar documentos
            </button>
          )}
          {constrainedGoals.length > 0 && (
            <button type="button" className="ghost" onClick={onOpenPlanning}>
              Revisar metas
            </button>
          )}
        </section>
      )}

      <section className="kpi-grid">
        {metrics.kpis.map((kpi) => (
          <article className={`kpi ${kpi.status} ${kpi.availability}`} key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <p>{kpi.helper}</p>
            <small>
              {kpi.availability === 'unavailable'
                ? 'Sin datos suficientes'
                : kpi.availability === 'limited'
                  ? 'Lectura limitada'
                  : statusLabel(kpi.status)}
            </small>
          </article>
        ))}
      </section>

      {metrics.dataWarnings.length > 0 && (
        <section className="panel wide data-warning" aria-label="Limitaciones de datos">
          <AlertTriangle size={18} />
          <span>{metrics.dataWarnings.join(' ')}</span>
        </section>
      )}

      <details className="panel wide score-details">
        <summary>Cómo se forma el Score Finanzas OS</summary>
        <p>
          Indicador propio del periodo {metrics.period}; no es una calificación
          crediticia ni una recomendación financiera.
        </p>
        <ul>
          {Object.entries(metrics.scoreBreakdown).map(([label, value]) => (
            <li key={label}>
              {label}: {Math.round(value)} punto(s)
            </li>
          ))}
        </ul>
      </details>

      {facts.hasImports && (
        <section className="panel wide import-impact">
          <div className="panel-heading">
            <div>
              <h2>Pulso documental</h2>
              <p>
                Separacion de fuentes listas y documentos que aun requieren revision
                antes de alimentar el dashboard.
              </p>
            </div>
            <Gauge size={24} />
          </div>
          <p className="period-note">
            Cobertura {Math.round(documentQuality.coverageScore * 100)}% · snapshot{' '}
            {facts.latestMonth}. Los PDFs en revision no aplican saldos automaticamente.
          </p>
          <div className="document-risk-inline" aria-label="Riesgo documental">
            <AlertTriangle size={18} />
            <span>{documentQuality.risk.headline}</span>
            <small>
              {documentQuality.risk.appliedDocuments} doc. aplicaron movimientos ·{' '}
              {documentQuality.risk.pendingReconciliation} por conciliar ·{' '}
              {documentQuality.risk.skippedSemanticDuplicates +
                documentQuality.risk.skippedDuplicateRows}{' '}
              duplicado(s) omitidos
            </small>
          </div>
          <div className="impact-grid">
            <article>
              <FolderOpen size={20} />
              <strong>{facts.documents}</strong>
              <span>documento(s)</span>
            </article>
            <article>
              <Landmark size={20} />
              <strong>{facts.accounts}</strong>
              <span>cuenta(s)</span>
            </article>
            <article>
              <CircleDollarSign size={20} />
              <strong>{facts.transactions}</strong>
              <span>movimiento(s)</span>
            </article>
            <article>
              <AlertTriangle size={20} />
              <strong>{facts.reviewDocs}</strong>
              <span>por revisar</span>
            </article>
          </div>
          {documentQuality.buckets.length > 0 && (
            <div className="document-pulse-grid">
              {documentQuality.buckets.slice(0, 4).map((bucket) => (
                <article key={bucket.kind}>
                  <span>{bucket.label}</span>
                  <strong>
                    {bucket.processed}/{bucket.total}
                  </strong>
                  <small>
                    {bucket.review > 0
                      ? `${bucket.review} en revision`
                      : bucket.avgConfidence
                        ? `${Math.round(bucket.avgConfidence * 100)}% confianza`
                        : 'sin score'}
                  </small>
                </article>
              ))}
            </div>
          )}
          <div className="document-pills">
            {profile.importedDocuments.slice(0, 5).map((doc) => (
              <span key={doc.id}>
                {doc.fileType.toUpperCase()} · {doc.kind ?? 'unknown'} · {doc.status}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
