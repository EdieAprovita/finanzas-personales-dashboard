import type { ReactNode } from 'react'
import type { DocumentQualityProfile } from './documentQuality'
import { documentReviewActions } from './documentQuality'

interface DocumentKindAnalysisProps {
  quality: DocumentQualityProfile
}

export function DocumentKindAnalysis({ quality }: DocumentKindAnalysisProps): ReactNode {
  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <h2>Analisis por tipo de documento</h2>
          <p>
            Nomina, tarjetas, ahorro e inversiones quedan separados para evitar mezclar
            flujos con saldos.
          </p>
        </div>
      </div>
      {quality.buckets.length === 0 ? (
        <p className="empty">Aun no hay documentos clasificados.</p>
      ) : (
        <div className="document-kind-grid">
          {quality.buckets.map((bucket) => (
            <article key={bucket.kind}>
              <div>
                <span>{bucket.label}</span>
                <strong>{bucket.total} doc.</strong>
              </div>
              <dl>
                <div>
                  <dt>Listos</dt>
                  <dd>{bucket.processed}</dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>{bucket.review}</dd>
                </div>
                <div>
                  <dt>Confianza</dt>
                  <dd>
                    {bucket.avgConfidence
                      ? `${Math.round(bucket.avgConfidence * 100)}%`
                      : '--'}
                  </dd>
                </div>
                <div>
                  <dt>Campos</dt>
                  <dd>
                    {bucket.detectedFields}/{bucket.expectedFields || '--'}
                  </dd>
                </div>
              </dl>
              {bucket.subtypes.length > 0 && (
                <div
                  className="document-subtype-list"
                  aria-label={`Subtipos de ${bucket.label}`}
                >
                  {bucket.subtypes.map((subtype) => (
                    <span key={subtype.label}>
                      <strong>{subtype.label}</strong>
                      {subtype.total} doc. · {Math.round(subtype.completeness * 100)}%
                      {subtype.review > 0 ? ` · ${subtype.review} revisar` : ''}
                      {subtype.legacyDocuments > 0
                        ? ` · ${subtype.legacyDocuments} legado`
                        : ''}
                      {subtype.reanalysisRecommended > 0
                        ? ` · ${subtype.reanalysisRecommended} reanalizar`
                        : ''}
                      {subtype.missingFields.length > 0
                        ? ` · faltan ${subtype.missingFields
                            .map((field) => `${field.label} (${field.missingDocuments})`)
                            .join(', ')}`
                        : ''}
                    </span>
                  ))}
                </div>
              )}
              {bucket.missingFields.length > 0 && (
                <small>Faltan: {bucket.missingFields.slice(0, 4).join(', ')}</small>
              )}
              <small>{documentReviewActions(bucket.kind)[0]}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
