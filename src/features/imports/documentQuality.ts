import type { DocumentKind, FinancialProfile, ImportedDocument } from '../../domain/types'
import { documentFieldLabel, documentKindLabels, documentSubtypeForExtracted, expectedFieldSpecsForExtracted } from '../../lib/documentFieldSpecs'

export interface DocumentQualityBucket {
  kind: DocumentKind
  label: string
  total: number
  processed: number
  review: number
  rejected: number
  avgConfidence: number
  avgQuality: number
  detectedFields: number
  expectedFields: number
  missingFields: string[]
  subtypes: DocumentQualitySubtype[]
}

export interface DocumentQualitySubtype {
  label: string
  total: number
  review: number
  legacyDocuments: number
  reanalysisRecommended: number
  detectedFields: number
  expectedFields: number
  completeness: number
  missingFields: Array<{
    label: string
    missingDocuments: number
  }>
}

export interface DocumentQualityProfile {
  total: number
  processed: number
  review: number
  rejected: number
  avgConfidence: number
  avgQuality: number
  coverageScore: number
  detectedFields: number
  expectedFields: number
  missingFields: string[]
  buckets: DocumentQualityBucket[]
  topActions: string[]
  risk: DocumentRiskProfile
  captureGaps: DocumentCaptureGap[]
  captureReadiness: DocumentCaptureReadiness
  improvementPlan: DocumentImprovementItem[]
}

export interface DocumentImprovementItem {
  priority: 'Alta' | 'Media' | 'Baja'
  label: string
  documents: number
  completeness: number
  action: string
  reason: string
  missingFields: string[]
}

export interface DocumentRiskProfile {
  appliedDocuments: number
  reviewOnlyDocuments: number
  pendingReconciliation: number
  duplicateDocumentIds: number
  duplicateTransactionFingerprints: number
  skippedDuplicateRows: number
  skippedSemanticDuplicates: number
  warningDocuments: number
  headline: string
}

export interface DocumentCaptureGap {
  kind: DocumentKind
  label: string
  totalDocuments: number
  legacyDocuments: number
  detectedFields: number
  expectedFields: number
  completeness: number
  missingFields: Array<{
    key: string
    label: string
    missingDocuments: number
  }>
}

export interface DocumentCaptureReadiness {
  rawFilesPersisted: boolean
  currentSchemaDocuments: number
  legacyDocuments: number
  reimportRecommended: number
  headline: string
}

export interface DocumentQualitySummary {
  status: 'complete' | 'incomplete' | 'legacy' | 'unknown'
  label: string
  detectedFields: number
  expectedFields: number
  completeness: number
  missingFields: Array<{
    key: string
    label: string
  }>
}

export interface PersistedDocumentReanalysisResult {
  profile: FinancialProfile
  changedDocuments: number
  currentSchemaDocuments: number
  legacyDocuments: number
  incompleteDocuments: number
  missingFields: string[]
  summary: string
}

const reviewActions: Record<DocumentKind, string[]> = {
  credit_card_statement: [
    'Validar corte, fecha limite, pago minimo y pago para no generar intereses.',
    'Cuadrar saldo anterior, cargos, abonos, intereses, IVA y saldo actual antes de poblar deuda.',
  ],
  payroll_cfdi: [
    'Reconciliar percepciones, deducciones, otros pagos e ingreso neto.',
    'Verificar UUID/estatus CFDI cuando el recibo venga de XML SAT.',
  ],
  bank_statement: [
    'Completar saldo inicial/final, periodo, depositos, retiros y SPEI.',
    'Separar ahorro liquido de cuentas operativas para no mezclar flujo con reservas.',
  ],
  investment_statement: [
    'Separar portafolio, efectivo, instrumentos, rendimiento y moneda.',
    'Revisar liquidez de Smart Cash, fondos, CETES, BONDDIA o GBM antes de contarlo como efectivo.',
  ],
  invoice_cfdi: ['Validar UUID, emisor, receptor, subtotal, IVA, total y categoria fiscal sugerida.'],
  purchase_receipt: ['Confirmar comercio, total, IVA y fecha cuando el OCR tenga baja confianza.'],
  unknown: ['Clasificar manualmente o volver a importar con un formato mas legible.'],
}

function numericExtracted(doc: ImportedDocument, key: string) {
  const value = doc.extracted?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringArrayExtracted(doc: ImportedDocument, key: string) {
  const value = doc.extracted?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item)) : []
}

function booleanExtracted(doc: ImportedDocument, key: string) {
  return doc.extracted?.[key] === true
}

function stringExtracted(doc: ImportedDocument, key: string) {
  const value = doc.extracted?.[key]
  return typeof value === 'string' ? value : ''
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function extractedValuePopulated(value: unknown) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

function currentSchemaDocument(doc: ImportedDocument) {
  return numericExtracted(doc, 'expectedFields') > 0 || numericExtracted(doc, 'qualitySchemaVersion') > 0
}

function qualityScoreFromCompleteness(completeness: number, hasAppliedRows: boolean) {
  const base = Math.max(0, Math.min(1, completeness))
  return Number(Math.min(1, base * 0.85 + (hasAppliedRows ? 0.15 : 0.05)).toFixed(2))
}

function derivedFieldSummary(doc: ImportedDocument) {
  const kind = doc.kind ?? 'unknown'
  const specs = expectedFieldSpecsForExtracted(kind, doc.extracted ?? {})
  const missing = specs.filter((field) => !extractedValuePopulated(doc.extracted?.[field.key]))
  const storedExpectedFields = numericExtracted(doc, 'expectedFields')
  const storedDetectedFields = numericExtracted(doc, 'detectedFields')
  const expectedFields = specs.length || storedExpectedFields
  const detectedFields = specs.length ? Math.max(0, specs.length - missing.length) : storedDetectedFields
  return {
    expectedFields,
    detectedFields,
    missingFields: missing.map((field) => field.key),
  }
}

export function documentQualitySummary(doc: ImportedDocument): DocumentQualitySummary {
  const kind = doc.kind ?? 'unknown'
  const extracted = doc.extracted ?? {}
  const fieldSpecs = expectedFieldSpecsForExtracted(kind, extracted)
  const storedExpectedFields = numericExtracted(doc, 'expectedFields')
  const storedDetectedFields = numericExtracted(doc, 'detectedFields')
  const storedMissingFields = stringArrayExtracted(doc, 'missingFields')

  if (!fieldSpecs.length && !storedExpectedFields) {
    return {
      status: 'unknown',
      label: 'Sin matriz',
      detectedFields: 0,
      expectedFields: 0,
      completeness: 0,
      missingFields: [],
    }
  }

  const derivedMissing = fieldSpecs
    .filter((field) => !extractedValuePopulated(doc.extracted?.[field.key]))
    .map((field) => ({ key: field.key, label: field.label }))
  const expectedFields = storedExpectedFields || fieldSpecs.length
  const detectedFields = storedExpectedFields ? storedDetectedFields : Math.max(0, fieldSpecs.length - derivedMissing.length)
  const missingFields = storedMissingFields.length
    ? storedMissingFields.map((key) => ({ key, label: fieldSpecs.find((field) => field.key === key)?.label ?? documentFieldLabel(key) }))
    : derivedMissing
  const completeness = expectedFields ? Number((detectedFields / expectedFields).toFixed(2)) : 0
  const status = !currentSchemaDocument(doc)
    ? 'legacy'
    : completeness >= 0.9 && missingFields.length === 0
      ? 'complete'
      : 'incomplete'

  return {
    status,
    label: status === 'complete' ? 'Completo' : status === 'incomplete' ? 'Incompleto' : status === 'legacy' ? 'Legado' : 'Sin matriz',
    detectedFields,
    expectedFields,
    completeness,
    missingFields: missingFields.slice(0, 6),
  }
}

function derivedCaptureFor(kind: DocumentKind, documents: ImportedDocument[]): DocumentCaptureGap | null {
  const documentSpecs = documents.map((doc) => ({
    doc,
    specs: expectedFieldSpecsForExtracted(kind, doc.extracted ?? {}),
  }))
  const specByKey = new Map<string, { key: string; label: string }>()
  for (const { specs } of documentSpecs) {
    for (const field of specs) specByKey.set(field.key, field)
  }
  if (!documents.length || specByKey.size === 0) return null

  const missingFields = [...specByKey.values()]
    .map((field) => ({
      ...field,
      missingDocuments: documentSpecs.filter(({ doc, specs }) => specs.some((specItem) => specItem.key === field.key) && !extractedValuePopulated(doc.extracted?.[field.key])).length,
    }))
    .filter((field) => field.missingDocuments > 0)
    .sort((a, b) => b.missingDocuments - a.missingDocuments || a.label.localeCompare(b.label))

  const expectedFields = documentSpecs.reduce((sum, { specs }) => sum + specs.length, 0)
  const missingCount = missingFields.reduce((sum, field) => sum + field.missingDocuments, 0)
  const detectedFields = expectedFields - missingCount
  const legacyDocuments = documentSpecs.filter(
    ({ doc, specs }) => numericExtracted(doc, 'expectedFields') === 0 && specs.some((field) => !extractedValuePopulated(doc.extracted?.[field.key])),
  ).length

  return {
    kind,
    label: documentKindLabels[kind],
    totalDocuments: documents.length,
    legacyDocuments,
    detectedFields,
    expectedFields,
    completeness: expectedFields ? Number((detectedFields / expectedFields).toFixed(2)) : 0,
    missingFields: missingFields.slice(0, 8).map(({ key, label, missingDocuments }) => ({ key, label, missingDocuments })),
  }
}

function analyzeCaptureGaps(groups: Record<DocumentKind, ImportedDocument[]>) {
  return (Object.entries(groups) as Array<[DocumentKind, ImportedDocument[]]>)
    .map(([kind, rows]) => derivedCaptureFor(kind, rows))
    .filter((gap): gap is DocumentCaptureGap => Boolean(gap))
    .sort((a, b) => b.legacyDocuments - a.legacyDocuments || a.completeness - b.completeness || b.totalDocuments - a.totalDocuments)
}

function analyzeCaptureReadiness(documents: ImportedDocument[]): DocumentCaptureReadiness {
  const legacyDocuments = documents.filter((doc) => !currentSchemaDocument(doc) && expectedFieldSpecsForExtracted(doc.kind ?? 'unknown', doc.extracted ?? {}).length > 0).length
  const currentSchemaDocuments = documents.filter(currentSchemaDocument).length
  const reimportRecommended = documents.filter((doc) => documentQualitySummary(doc).status === 'legacy' || documentQualitySummary(doc).status === 'incomplete').length
  const headline = legacyDocuments
    ? `${legacyDocuments} documento(s) fueron importados antes del esquema de calidad actual.`
    : reimportRecommended
      ? `${reimportRecommended} documento(s) necesitan completar campos clave.`
      : 'Los documentos importados tienen metadata de calidad actual.'

  return {
    rawFilesPersisted: false,
    currentSchemaDocuments,
    legacyDocuments,
    reimportRecommended,
    headline,
  }
}

function improvementActionForGap(gap: DocumentCaptureGap) {
  if (gap.kind === 'credit_card_statement') return 'Reimportar estados de tarjeta y validar corte, saldo, pagos, cargos y conciliacion.'
  if (gap.kind === 'bank_statement') return 'Reimportar estados bancarios o ahorro para separar depositos, retiros, saldos y SPEI.'
  if (gap.kind === 'payroll_cfdi') return 'Reimportar XML/PDF de nomina para recuperar periodo, percepciones, deducciones y dias pagados.'
  if (gap.kind === 'investment_statement') return 'Reimportar estados de inversion para separar posiciones, liquidez, rendimiento, ISR y operaciones.'
  if (gap.kind === 'invoice_cfdi') return 'Reimportar CFDI para validar emisor, receptor, UUID, subtotal, IVA y total.'
  return 'Reclasificar o reimportar con un archivo mas legible para completar la matriz.'
}

function improvementReasonForGap(gap: DocumentCaptureGap) {
  if (gap.legacyDocuments > 0) return `${gap.legacyDocuments} documento(s) requieren el archivo original para recapturar campos faltantes.`
  if (gap.completeness < 0.5) return 'Cobertura menor a 50%; puede sesgar flujo, deuda, ahorro o patrimonio.'
  if (gap.completeness < 0.8) return 'Cobertura parcial; sirve para lectura direccional, pero no para automatizar saldos sin revision.'
  return 'Quedan campos menores pendientes antes de usar esta fuente para decisiones.'
}

function analyzeImprovementPlan(captureGaps: DocumentCaptureGap[]): DocumentImprovementItem[] {
  return captureGaps
    .filter((gap) => gap.missingFields.length > 0 || gap.completeness < 0.9)
    .map((gap) => {
      const priority: DocumentImprovementItem['priority'] = gap.completeness < 0.5 || gap.totalDocuments >= 10 ? 'Alta' : gap.completeness < 0.8 ? 'Media' : 'Baja'
      return {
        priority,
        label: gap.label,
        documents: gap.totalDocuments,
        completeness: gap.completeness,
        action: improvementActionForGap(gap),
        reason: improvementReasonForGap(gap),
        missingFields: gap.missingFields.slice(0, 4).map((field) => `${field.label} (${field.missingDocuments})`),
      }
    })
    .sort((a, b) => {
      const priorityScore = { Alta: 3, Media: 2, Baja: 1 }
      return priorityScore[b.priority] - priorityScore[a.priority] || a.completeness - b.completeness || b.documents - a.documents
    })
    .slice(0, 5)
}

function bucketFor(kind: DocumentKind, documents: ImportedDocument[]): DocumentQualityBucket {
  const fieldSummaries = documents.map((doc) => ({ doc, ...derivedFieldSummary(doc) }))
  const detectedFields = fieldSummaries.reduce((sum, doc) => sum + doc.detectedFields, 0)
  const expectedFields = fieldSummaries.reduce((sum, doc) => sum + doc.expectedFields, 0)
  const qualityScores = documents.map((doc) => numericExtracted(doc, 'qualityScore'))
  const subtypeGroups = fieldSummaries.reduce<Record<string, typeof fieldSummaries>>((groups, row) => {
    const subtype = documentSubtypeForExtracted(row.doc.kind ?? 'unknown', row.doc.extracted ?? {})
    groups[subtype.key] = [...(groups[subtype.key] ?? []), row]
    return groups
  }, {})
  return {
    kind,
    label: documentKindLabels[kind],
    total: documents.length,
    processed: documents.filter((doc) => doc.status === 'processed').length,
    review: documents.filter((doc) => doc.status === 'needs_review').length,
    rejected: documents.filter((doc) => doc.status === 'rejected').length,
    avgConfidence: average(documents.map((doc) => doc.confidence ?? 0)),
    avgQuality: average(qualityScores),
    detectedFields,
    expectedFields,
    missingFields: unique(fieldSummaries.flatMap((doc) => doc.missingFields)).map(documentFieldLabel).slice(0, 8),
    subtypes: Object.entries(subtypeGroups)
      .map(([subtypeKey, rows]) => {
        const subtype = documentSubtypeForExtracted(rows[0]?.doc.kind ?? 'unknown', rows[0]?.doc.extracted ?? {})
        const subtypeExpected = rows.reduce((sum, row) => sum + row.expectedFields, 0)
        const subtypeDetected = rows.reduce((sum, row) => sum + row.detectedFields, 0)
        const missingCounts = rows
          .flatMap((row) => row.missingFields)
          .reduce<Record<string, number>>((counts, field) => {
            counts[field] = (counts[field] ?? 0) + 1
            return counts
          }, {})
        return {
          label: subtype.key === subtypeKey ? subtype.label : subtypeKey,
          total: rows.length,
          review: rows.filter((row) => row.doc.status === 'needs_review').length,
          legacyDocuments: rows.filter((row) => documentQualitySummary(row.doc).status === 'legacy').length,
          reanalysisRecommended: rows.filter((row) => ['legacy', 'incomplete'].includes(documentQualitySummary(row.doc).status)).length,
          detectedFields: subtypeDetected,
          expectedFields: subtypeExpected,
          completeness: subtypeExpected ? Number((subtypeDetected / subtypeExpected).toFixed(2)) : 0,
          missingFields: Object.entries(missingCounts)
            .sort((a, b) => b[1] - a[1] || documentFieldLabel(a[0]).localeCompare(documentFieldLabel(b[0])))
            .slice(0, 3)
            .map(([field, missingDocuments]) => ({ label: documentFieldLabel(field), missingDocuments })),
        }
      })
      .sort((a, b) => b.review - a.review || a.completeness - b.completeness || b.total - a.total || a.label.localeCompare(b.label))
      .slice(0, 4),
  }
}

function actionForBucket(bucket: DocumentQualityBucket) {
  if (bucket.rejected > 0) return `${bucket.label}: ${bucket.rejected} documento(s) rechazado(s); revisar formato o tamano.`
  if (bucket.review > 0 && bucket.missingFields.length > 0) {
    return `${bucket.label}: completar ${bucket.missingFields.slice(0, 3).join(', ')}.`
  }
  if (bucket.review > 0) return `${bucket.label}: revisar ${bucket.review} documento(s) antes de aplicar saldos.`
  if (bucket.total > 0 && bucket.avgConfidence < 0.7) return `${bucket.label}: mejorar legibilidad o OCR, confianza promedio baja.`
  return reviewActions[bucket.kind][0]
}

function countDuplicates(values: string[]) {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
  return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
}

function transactionFingerprint(profile: FinancialProfile) {
  return profile.transactions.map((tx) => `${tx.date}|${Math.round(tx.amount * 100)}|${tx.type}|${tx.category}|${tx.merchant}|${tx.accountId}`)
}

function analyzeDocumentRisk(profile: FinancialProfile): DocumentRiskProfile {
  const documents = profile.importedDocuments
  const appliedDocuments = documents.filter((doc) => (doc.sourceTransactionIds?.length ?? 0) > 0).length
  const reviewOnlyDocuments = documents.filter((doc) => doc.status === 'needs_review' && !(doc.sourceTransactionIds?.length ?? 0)).length
  const skippedDuplicateRows = documents.reduce((sum, doc) => sum + numericExtracted(doc, 'skippedDuplicateRows'), 0)
  const skippedSemanticDuplicates = documents.reduce((sum, doc) => sum + numericExtracted(doc, 'skippedSemanticDuplicates'), 0)
  const warningDocuments = documents.filter((doc) => (doc.warnings?.length ?? 0) > 0).length
  const pendingReconciliation = documents.filter(
    (doc) =>
      doc.status === 'needs_review' ||
      booleanExtracted(doc, 'balancePendingReview') ||
      numericExtracted(doc, 'skippedRows') > 0 ||
      numericExtracted(doc, 'unparsedDates') > 0 ||
      (doc.kind === 'credit_card_statement' && ['mismatch', 'insufficient'].includes(stringExtracted(doc, 'cardReconciliationStatus'))) ||
      (doc.warnings ?? []).some((warning) => /concili|duplica|revision|pendiente|omit/i.test(warning)),
  ).length
  const duplicateDocumentIds = countDuplicates(documents.map((doc) => doc.id))
  const duplicateTransactionFingerprints = countDuplicates(transactionFingerprint(profile))
  const headline =
    skippedSemanticDuplicates > 0
      ? `${skippedSemanticDuplicates} movimiento(s) de nomina no se duplicaron.`
      : pendingReconciliation > 0
        ? `${pendingReconciliation} documento(s) requieren conciliacion antes de confiar al 100%.`
        : duplicateTransactionFingerprints > 0
          ? `${duplicateTransactionFingerprints} posible(s) duplicado(s) exactos en movimientos.`
          : 'Sin duplicados exactos detectados en documentos y movimientos.'

  return {
    appliedDocuments,
    reviewOnlyDocuments,
    pendingReconciliation,
    duplicateDocumentIds,
    duplicateTransactionFingerprints,
    skippedDuplicateRows,
    skippedSemanticDuplicates,
    warningDocuments,
    headline,
  }
}

export function analyzeDocumentQuality(profile: FinancialProfile): DocumentQualityProfile {
  const documents = profile.importedDocuments
  const byKind = documents.reduce<Record<DocumentKind, ImportedDocument[]>>((groups, doc) => {
    const kind = doc.kind ?? 'unknown'
    groups[kind] = [...(groups[kind] ?? []), doc]
    return groups
  }, {} as Record<DocumentKind, ImportedDocument[]>)
  const buckets = (Object.entries(byKind) as Array<[DocumentKind, ImportedDocument[]]>)
    .map(([kind, rows]) => bucketFor(kind, rows))
    .sort((a, b) => b.review - a.review || b.total - a.total)
  const captureGaps = analyzeCaptureGaps(byKind)
  const derivedDetectedFields = captureGaps.reduce((sum, gap) => sum + gap.detectedFields, 0)
  const derivedExpectedFields = captureGaps.reduce((sum, gap) => sum + gap.expectedFields, 0)

  const storedDetectedFields = buckets.reduce((sum, bucket) => sum + bucket.detectedFields, 0)
  const storedExpectedFields = buckets.reduce((sum, bucket) => sum + bucket.expectedFields, 0)
  const detectedFields = Math.max(storedDetectedFields, derivedDetectedFields)
  const expectedFields = Math.max(storedExpectedFields, derivedExpectedFields)
  const processed = documents.filter((doc) => doc.status === 'processed').length
  const review = documents.filter((doc) => doc.status === 'needs_review').length
  const rejected = documents.filter((doc) => doc.status === 'rejected').length
  const missingFields = unique(buckets.flatMap((bucket) => bucket.missingFields)).slice(0, 10)
  const coverageScore = documents.length
    ? Number(
        (
          (processed / documents.length) * 0.25 +
          (1 - rejected / documents.length) * 0.2 +
          (expectedFields ? detectedFields / expectedFields : average(documents.map((doc) => doc.confidence ?? 0))) * 0.4 +
          average(documents.map((doc) => numericExtracted(doc, 'qualityScore') || doc.confidence || 0)) * 0.15
        ).toFixed(2),
      )
    : 0

  return {
    total: documents.length,
    processed,
    review,
    rejected,
    avgConfidence: average(documents.map((doc) => doc.confidence ?? 0)),
    avgQuality: average(documents.map((doc) => numericExtracted(doc, 'qualityScore'))),
    coverageScore,
    detectedFields,
    expectedFields,
    missingFields,
    buckets,
    topActions: [
      ...captureGaps
        .filter((gap) => gap.legacyDocuments > 0 || gap.completeness < 0.7)
        .slice(0, 2)
        .map((gap) => `${gap.label}: ${gap.legacyDocuments || gap.totalDocuments} documento(s) necesitan reimportacion o extraccion ampliada para ${gap.missingFields.slice(0, 3).map((field) => field.label).join(', ')}.`),
      ...buckets.map(actionForBucket),
    ].filter((action): action is string => Boolean(action)).slice(0, 4),
    risk: analyzeDocumentRisk(profile),
    captureGaps,
    captureReadiness: analyzeCaptureReadiness(documents),
    improvementPlan: analyzeImprovementPlan(captureGaps),
  }
}

export function documentReviewActions(kind: ImportedDocument['kind']) {
  return reviewActions[kind ?? 'unknown']
}

export function reanalyzePersistedDocuments(profile: FinancialProfile): PersistedDocumentReanalysisResult {
  const analyzedAt = new Date().toISOString()
  let changedDocuments = 0
  let legacyDocuments = 0
  let incompleteDocuments = 0
  const missingFieldCounts = new Map<string, number>()

  const importedDocuments = profile.importedDocuments.map((doc) => {
    const before = documentQualitySummary(doc)
    if (before.status === 'legacy') legacyDocuments += 1

    const kind = doc.kind ?? 'unknown'
    const extracted = doc.extracted ?? {}
    const subtype = documentSubtypeForExtracted(kind, extracted)
    const specs = expectedFieldSpecsForExtracted(kind, extracted)
    const missingFields = specs.filter((field) => !extractedValuePopulated(extracted[field.key])).map((field) => field.key)
    for (const field of missingFields) missingFieldCounts.set(field, (missingFieldCounts.get(field) ?? 0) + 1)

    const expectedFields = specs.length
    const detectedFields = expectedFields ? Math.max(0, expectedFields - missingFields.length) : numericExtracted(doc, 'detectedFields')
    const completeness = expectedFields ? detectedFields / expectedFields : before.completeness
    if (expectedFields > 0 && detectedFields < expectedFields) incompleteDocuments += 1
    const qualityScore = qualityScoreFromCompleteness(completeness, (doc.sourceTransactionIds?.length ?? 0) > 0 || numericExtracted(doc, 'appliedRows') > 0)
    const nextExtracted = {
      ...extracted,
      qualitySchemaVersion: 2,
      documentSubtype: subtype.key,
      documentSubtypeLabel: subtype.label,
      expectedFields,
      detectedFields,
      missingFields,
      qualityScore,
      requiresRawReimport: missingFields.length > 0,
      reanalysis: {
        analyzedAt,
        method: 'persisted-extracted-metadata',
        rawFilesPersisted: false,
        previousStatus: before.status,
        previousQualitySchemaVersion: numericExtracted(doc, 'qualitySchemaVersion'),
      },
    }

    const changed =
      numericExtracted(doc, 'qualitySchemaVersion') !== 2 ||
      numericExtracted(doc, 'expectedFields') !== expectedFields ||
      numericExtracted(doc, 'detectedFields') !== detectedFields ||
      JSON.stringify(stringArrayExtracted(doc, 'missingFields')) !== JSON.stringify(missingFields) ||
      stringExtracted(doc, 'documentSubtype') !== subtype.key

    if (changed) changedDocuments += 1
    return changed ? { ...doc, extracted: nextExtracted } : doc
  })

  const currentSchemaDocuments = importedDocuments.filter(currentSchemaDocument).length
  const missingFields = [...missingFieldCounts.entries()]
    .sort((a, b) => b[1] - a[1] || documentFieldLabel(a[0]).localeCompare(documentFieldLabel(b[0])))
    .slice(0, 8)
    .map(([field, count]) => `${documentFieldLabel(field)} (${count})`)

  const summary =
    changedDocuments > 0
      ? `Reanalisis local actualizado en ${changedDocuments} documento(s). ${incompleteDocuments} documento(s) siguen requiriendo reimportacion para completar campos no persistidos.`
      : `Los ${profile.importedDocuments.length} documento(s) ya estaban alineados con la matriz actual.`

  return {
    profile: { ...profile, importedDocuments },
    changedDocuments,
    currentSchemaDocuments,
    legacyDocuments,
    incompleteDocuments,
    missingFields,
    summary,
  }
}
