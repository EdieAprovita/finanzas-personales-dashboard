import { useMemo } from 'react'
import {
  AlertTriangle,
  CircleDollarSign,
  FolderOpen,
  Gauge,
  Landmark,
} from 'lucide-react'
import type { FinancialMetrics } from '../../domain/finance'
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
            onChange={(event) => onReportingPeriodChange(event.target.value)}
          >
            {periods.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
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
