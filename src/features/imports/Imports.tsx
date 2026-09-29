import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import type { FinancialProfile } from '../../domain/types'
import { documentKindLabels } from '../../lib/documentFieldSpecs'
import { DocumentKindAnalysis } from './DocumentKindAnalysis'
import { DocumentQualityPanel } from './DocumentQualityPanel'
import { DocumentReviewForm } from './DocumentReviewForm'
import { ExtractedDetailTable } from './ExtractedDetailTable'
import { ImportEntryPanel } from './ImportEntryPanel'
import {
  cardMovementColumns,
  cardPaymentScenarioColumns,
  extractedFieldLabels,
  extractedObjectRows,
  extractedPreviewEntries,
  formatExtractedValue,
  investmentOperationColumns,
  payrollConceptColumns,
  payrollPerceptionColumns,
  positionColumns,
  safeDocumentSummary,
  safeDocumentTitle,
  statementMovementColumns,
  subaccountColumns,
} from './documentPresentation'
import { analyzeDocumentQuality, documentQualitySummary } from './documentQuality'
import type { ReviewedDocumentFields } from '../../lib/importers'


export function Imports({
  profile,
  importMessage,
  isImporting,
  importQueue,
  onFiles,
  onReanalyzePersistedDocuments,
  onApplyReviewedDocumentMovements,
}: {
  profile: FinancialProfile
  importMessage: string
  isImporting: boolean
  importQueue: string[]
  onFiles: (files: File[], mode: 'current' | 'new') => void
  onReanalyzePersistedDocuments: () => void
  onApplyReviewedDocumentMovements: (documentId: string, fields?: ReviewedDocumentFields) => void
}) {
  const [documentFilter, setDocumentFilter] = useState<'all' | 'needs_review' | 'processed' | 'rejected'>('all')
  const quality = useMemo(() => analyzeDocumentQuality(profile), [profile])
  const visibleDocuments = useMemo(
    () =>
      profile.importedDocuments
        .filter((document) => documentFilter === 'all' || document.status === documentFilter)
        .sort((left, right) => {
          const statusPriority = { needs_review: 0, rejected: 1, processed: 2 }
          return statusPriority[left.status] - statusPriority[right.status] || right.importedAt.localeCompare(left.importedAt)
        }),
    [documentFilter, profile.importedDocuments],
  )
  const reviewQueue = useMemo(() => {
    const pending = profile.importedDocuments.filter((document) => document.status === 'needs_review')
    const payroll = pending.filter((document) => document.kind === 'payroll_cfdi')
    const cards = pending.filter((document) => document.kind === 'credit_card_statement')
    const receipts = pending.filter((document) => document.kind === 'purchase_receipt')

    return {
      cardsMissingBalance: cards.filter((document) => typeof document.extracted?.currentBalance !== 'number').length,
      cardsWithBalance: cards.filter((document) => typeof document.extracted?.currentBalance === 'number').length,
      payrollMissingPaymentDate: payroll.filter((document) => typeof document.extracted?.paymentDate !== 'string').length,
      payrollWithNetIncome: payroll.filter(
        (document) => typeof document.extracted?.netIncome === 'number' && document.extracted.netIncome > 0,
      ).length,
      receipts: receipts.length,
    }
  }, [profile.importedDocuments])

  return (
    <div className="dashboard-grid">
      <ImportEntryPanel
        profile={profile}
        importMessage={importMessage}
        importQueue={importQueue}
        isImporting={isImporting}
        onFiles={onFiles}
      />
      <DocumentQualityPanel
        quality={quality}
        onReanalyzePersistedDocuments={onReanalyzePersistedDocuments}
      />
      <DocumentKindAnalysis quality={quality} />

      {quality.review > 0 && (
        <section className="panel wide import-review-queue" aria-label="Decisiones pendientes de documentos">
          <div className="panel-heading">
            <div>
              <h2>Decisiones pendientes</h2>
              <p>
                Se importaron {profile.importedDocuments.length} documentos, pero aún no se aplican datos al
                dashboard hasta que confirmes cada dato sensible. No se descartaron.
              </p>
            </div>
            <AlertTriangle size={24} />
          </div>

          <div className="import-review-queue-grid">
            {reviewQueue.payrollWithNetIncome > 0 && (
              <article>
                <strong>Nómina</strong>
                <span>{reviewQueue.payrollWithNetIncome} con ingreso neto detectado</span>
                <p>
                  Confirma la fecha de pago para registrar cada ingreso. Faltan fechas en{' '}
                  {reviewQueue.payrollMissingPaymentDate}.
                </p>
              </article>
            )}
            {reviewQueue.cardsWithBalance > 0 && (
              <article>
                <strong>Tarjetas</strong>
                <span>{reviewQueue.cardsWithBalance} con saldo detectado</span>
                <p>
                  Confirma solo el estado más reciente de cada tarjeta para actualizar la deuda. Esto no crea gastos
                  sin movimientos validados.
                </p>
              </article>
            )}
            {reviewQueue.cardsMissingBalance > 0 && (
              <article>
                <strong>Estados incompletos</strong>
                <span>{reviewQueue.cardsMissingBalance} requieren saldo manual</span>
                <p>Completa el saldo actual o vuelve a subir un CSV del banco para registrar cargos individualmente.</p>
              </article>
            )}
            {reviewQueue.receipts > 0 && (
              <article>
                <strong>Tickets</strong>
                <span>{reviewQueue.receipts} requieren revisión</span>
                <p>Vuelve a subir una imagen legible o registra el gasto desde “Registrar”; faltan campos para aplicarlo.</p>
              </article>
            )}
          </div>

          <button type="button" className="ghost primary" onClick={() => setDocumentFilter('needs_review')}>
            Abrir documentos por revisar ({quality.review})
          </button>
        </section>
      )}

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Documentos recientes</h2>
            <p>Vista protegida: nombres de archivo, conceptos y texto libre permanecen ocultos por defecto.</p>
          </div>
        </div>
        {profile.importedDocuments.length > 0 && (
          <div className="document-filter" role="group" aria-label="Filtrar documentos por estado">
            {[
              ['all', `Todos (${profile.importedDocuments.length})`],
              ['needs_review', `Revisar (${quality.review})`],
              ['processed', `Listos (${quality.processed})`],
              ['rejected', `Rechazados (${quality.rejected})`],
            ].map(([filter, label]) => (
              <button type="button" key={filter} className={documentFilter === filter ? 'active' : ''} aria-pressed={documentFilter === filter} onClick={() => setDocumentFilter(filter as 'all' | 'needs_review' | 'processed' | 'rejected')}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="document-list">
          {profile.importedDocuments.length === 0 ? (
            <p className="empty">Aun no hay documentos importados en este perfil.</p>
          ) : visibleDocuments.length === 0 ? (
            <p className="empty">No hay documentos en este estado.</p>
          ) : (
            visibleDocuments.map((doc, index) => {
              const extractedEntries = extractedPreviewEntries(doc)
              const qualitySummary = documentQualitySummary(doc)
              const statementMovementRows = extractedObjectRows(doc, 'statementMovementRows')
              const cardMovementRows = extractedObjectRows(doc, 'cardMovementRows')
              const cardPaymentScenarioRows = extractedObjectRows(doc, 'cardPaymentScenarios')
              const investmentOperationRows = extractedObjectRows(doc, 'investmentOperationRows')
              const positionRows = extractedObjectRows(doc, 'positions')
              const subaccountRows = extractedObjectRows(doc, 'subaccountPositions')
              const perceptionRows = extractedObjectRows(doc, 'perceptionConcepts')
              const deductionRows = extractedObjectRows(doc, 'deductionConcepts')
              const otherPaymentRows = extractedObjectRows(doc, 'otherPaymentConcepts')
              const hasReviewedMovementApproval = Boolean(doc.extracted?.reviewedMovementRowsAppliedAt || doc.extracted?.reviewedPositionRowsAppliedAt)
              const canApplyStatementMovements = doc.kind === 'bank_statement' && statementMovementRows.length > 0 && !hasReviewedMovementApproval
              const canApplyCardMovements =
                doc.kind === 'credit_card_statement' &&
                cardMovementRows.length > 0 &&
                doc.extracted?.cardReconciliationStatus === 'balanced' &&
                !hasReviewedMovementApproval
              const canApplyInvestmentPositions = doc.kind === 'investment_statement' && (positionRows.length > 0 || subaccountRows.length > 0) && !hasReviewedMovementApproval
              const canApplyPayroll =
                doc.kind === 'payroll_cfdi' &&
                typeof doc.extracted?.paymentDate === 'string' &&
                typeof doc.extracted?.netIncome === 'number' &&
                doc.extracted.netIncome > 0 &&
                !hasReviewedMovementApproval
              const canApplyReviewedMovements = canApplyStatementMovements || canApplyCardMovements || canApplyInvestmentPositions || canApplyPayroll
              return (
                <article
                  key={doc.id}
                  data-testid="imported-document-card"
                  data-document-kind={doc.kind ?? 'unknown'}
                  data-document-status={doc.status}
                  data-document-subtype={typeof doc.extracted?.documentSubtype === 'string' ? doc.extracted.documentSubtype : ''}
                  data-document-index={index}
                >
                  <FileText size={18} />
                  <div>
                    <strong>{safeDocumentTitle(doc, index)}</strong>
                    <span>{safeDocumentSummary(doc)}</span>
                    <small>
                      {doc.fileType.toUpperCase()} · {documentKindLabels[doc.kind ?? 'unknown']} · {doc.status}
                      {doc.confidence !== undefined ? ` · confianza ${Math.round(doc.confidence * 100)}%` : ''}
                    </small>
                    {qualitySummary.expectedFields > 0 && (
                      <div className={`document-quality-chip ${qualitySummary.status}`}>
                        <strong>{qualitySummary.label}</strong>
                        <span>
                          Campos clave: {qualitySummary.detectedFields}/{qualitySummary.expectedFields}
                        </span>
                        {qualitySummary.missingFields.length > 0 && (
                          <small>Faltan: {qualitySummary.missingFields.slice(0, 3).map((field) => field.label).join(', ')}</small>
                        )}
                      </div>
                    )}
                    {extractedEntries.length > 0 && (
                      <dl className="document-fields">
                        {extractedEntries.map(([key, value]) => (
                          <div key={key}>
                            <dt>{extractedFieldLabels[key] ?? key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <ExtractedDetailTable title="Movimientos visibles para revisar" rows={statementMovementRows} columns={statementMovementColumns} />
                    <ExtractedDetailTable title="Movimientos de tarjeta para revisar" rows={cardMovementRows} columns={cardMovementColumns} />
                    <ExtractedDetailTable title="Escenarios de pago de tarjeta" rows={cardPaymentScenarioRows} columns={cardPaymentScenarioColumns} />
                    <ExtractedDetailTable title="Operaciones de inversion para revisar" rows={investmentOperationRows} columns={investmentOperationColumns} />
                    <ExtractedDetailTable title="Percepciones de nomina para revisar" rows={perceptionRows} columns={payrollPerceptionColumns} />
                    <ExtractedDetailTable title="Deducciones de nomina para revisar" rows={deductionRows} columns={payrollConceptColumns} />
                    <ExtractedDetailTable title="Otros pagos de nomina para revisar" rows={otherPaymentRows} columns={payrollConceptColumns} />
                    {!hasReviewedMovementApproval && !doc.sourceTransactionIds?.length && (doc.kind === 'payroll_cfdi' || doc.kind === 'credit_card_statement' || doc.kind === 'purchase_receipt') && (
                      <DocumentReviewForm document={doc} onApply={onApplyReviewedDocumentMovements} />
                    )}
                    {canApplyReviewedMovements && (
                      <div className="document-approval-actions">
                        <button type="button" className="ghost primary" onClick={() => onApplyReviewedDocumentMovements(doc.id)}>
                          <CheckCircle2 size={16} /> {canApplyInvestmentPositions ? 'Aplicar posiciones revisadas' : canApplyPayroll ? 'Aplicar nomina revisada' : 'Aplicar movimientos revisados'}
                        </button>
                      </div>
                    )}
                    {hasReviewedMovementApproval && (
                      <p className="document-applied-note">
                        {doc.extracted?.reviewedPositionRowsAppliedAt
                          ? `Posiciones aplicadas: ${formatExtractedValue('reviewedPositionRowsApplied', doc.extracted?.reviewedPositionRowsApplied)}`
                          : `Movimientos PDF aplicados: ${formatExtractedValue('reviewedMovementRowsApplied', doc.extracted?.reviewedMovementRowsApplied)}`}
                      </p>
                    )}
                    <ExtractedDetailTable title="Posiciones detectadas para revisar" rows={positionRows} columns={positionColumns} />
                    <ExtractedDetailTable title="Subcuentas detectadas para revisar" rows={subaccountRows} columns={subaccountColumns} />
                    {doc.warnings && doc.warnings.length > 0 && (
                      <ul className="document-warnings">
                        {[...new Set(doc.warnings)].map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
