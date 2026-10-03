import { AlertTriangle, CheckCircle2, FileText, Gauge } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DocumentQualityProfile } from './documentQuality'

interface DocumentQualityPanelProps {
  quality: DocumentQualityProfile
  onReanalyzePersistedDocuments: () => void
}

export function DocumentQualityPanel({
  quality,
  onReanalyzePersistedDocuments,
}: DocumentQualityPanelProps): ReactNode {
  return (
    <section className="panel document-quality-panel">
      <div className="panel-heading">
        <div>
          <h2>Calidad de extraccion</h2>
          <p>
            Completitud de campos detectados; no sustituye conciliación ni revisión de
            datos sensibles.
          </p>
        </div>
        <Gauge size={24} />
      </div>
      {quality.total > 0 ? (
        <>
          <div className="document-quality-score" aria-label="Cobertura de campos clave">
            <strong>{Math.round(quality.coverageScore * 100)}%</strong>
            <span>campos</span>
            <small>
              {quality.detectedFields}/{quality.expectedFields} detectados
            </small>
          </div>
          <div className="document-quality-kpis">
            <article>
              <CheckCircle2 size={16} />
              <strong>{quality.processed}</strong>
              <span>listos</span>
            </article>
            <article>
              <AlertTriangle size={16} />
              <strong>{quality.review}</strong>
              <span>por revisar</span>
            </article>
            <article>
              <FileText size={16} />
              <strong>{Math.round(quality.avgConfidence * 100)}%</strong>
              <span>confianza</span>
            </article>
          </div>
          <div className="document-capture-readiness" aria-label="Estado de captura de documentos">
            <div>
              <FileText size={18} />
              <strong>Estado de captura</strong>
            </div>
            <p>{quality.captureReadiness.headline}</p>
            <dl>
              <div>
                <dt>Extractor actual</dt>
                <dd>{quality.captureReadiness.currentSchemaDocuments}</dd>
              </div>
              <div>
                <dt>Legado</dt>
                <dd>{quality.captureReadiness.legacyDocuments}</dd>
              </div>
              <div>
                <dt>Incompletos</dt>
                <dd>{quality.captureReadiness.incompleteDocuments}</dd>
              </div>
              <div>
                <dt>Reimportar legacy</dt>
                <dd>{quality.captureReadiness.reimportRecommended}</dd>
              </div>
            </dl>
            {!quality.captureReadiness.rawFilesPersisted && (
              <small>
            No se guarda el archivo crudo; vuelve a subirlo desde el panel de
            importación para ejecutar una nueva extracción.
              </small>
            )}
            <button
              type="button"
              className="ghost primary reanalysis-action"
              onClick={onReanalyzePersistedDocuments}
            >
          <Gauge size={16} /> Actualizar diagnóstico guardado
            </button>
          </div>
          <div className="document-risk-card" aria-label="Riesgo de conteo y conciliacion">
            <div>
              <AlertTriangle size={18} />
              <strong>Riesgo de conteo y conciliacion</strong>
            </div>
            <p>{quality.risk.headline}</p>
            <dl>
              <div>
                <dt>Aplicaron</dt>
                <dd>{quality.risk.appliedDocuments}</dd>
              </div>
              <div>
                <dt>Pendientes</dt>
                <dd>{quality.risk.pendingReconciliation}</dd>
              </div>
              <div>
                <dt>Omitidos</dt>
                <dd>
                  {quality.risk.skippedSemanticDuplicates + quality.risk.skippedDuplicateRows}
                </dd>
              </div>
              <div>
                <dt>Duplicados exactos</dt>
                <dd>
                  {quality.risk.duplicateTransactionFingerprints +
                    quality.risk.duplicateDocumentIds}
                </dd>
              </div>
            </dl>
          </div>
          {quality.captureGaps.length > 0 && (
            <div className="document-gap-panel" aria-label="Brechas de captura documental">
              <div>
                <AlertTriangle size={18} />
                <strong>Brechas captura</strong>
              </div>
              {quality.captureGaps.slice(0, 3).map((gap) => (
                <article key={gap.subtypeKey}>
                  <div>
                    <span>{gap.label}</span>
                    <strong>{Math.round(gap.completeness * 100)}%</strong>
                  </div>
                  <p>
                    {gap.legacyDocuments > 0
                      ? `${gap.legacyDocuments} documento(s) legado.`
                      : `${gap.detectedFields}/${gap.expectedFields} campos esperados detectados.`}
                  </p>
                  {gap.missingFields.length > 0 && (
                    <small>
                      Faltan:{' '}
                      {gap.missingFields
                        .slice(0, 4)
                        .map((field) => `${field.label} (${field.missingDocuments})`)
                        .join(', ')}
                    </small>
                  )}
                </article>
              ))}
            </div>
          )}
          {quality.topActions.length > 0 && (
            <div className="document-next-actions">
              <strong>Prioridades</strong>
              {quality.topActions.map((action) => (
                <span key={action}>{action}</span>
              ))}
            </div>
          )}
          {quality.improvementPlan.length > 0 && (
            <div
              className="document-improvement-plan"
              aria-label="Plan de mejora de datos documentales"
            >
              <div>
                <AlertTriangle size={18} />
                <strong>Prioridad de captura</strong>
              </div>
              {quality.improvementPlan.map((item) => (
                <article key={item.label}>
                  <div>
                    <span>{item.priority}</span>
                    <strong>{item.label}</strong>
                    <em>
                      {item.documents} doc. · {Math.round(item.completeness * 100)}%
                    </em>
                  </div>
                  <p>{item.action}</p>
                  <small>{item.reason}</small>
                  {item.missingFields.length > 0 && (
                    <small>Campos faltantes: {item.missingFields.join(', ')}</small>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="empty">Aun no hay documentos importados para medir.</p>
      )}
    </section>
  )
}
