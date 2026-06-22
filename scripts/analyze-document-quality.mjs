import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { documentKindLabels, documentSubtypeForExtracted, expectedFieldSpecsForExtracted } from './lib/document-field-specs.mjs'

const outputPathArg = process.argv.find((arg) => arg.startsWith('--output='))
const outputPath = outputPathArg ? resolve(process.cwd(), outputPathArg.slice('--output='.length)) : ''
const writeReport = process.argv.includes('--write-report') || Boolean(outputPath)
const defaultReportPath = resolve(process.cwd(), 'reports/latest-document-quality-diagnostic.json')
const dbPath = resolve(process.cwd(), process.env.FINANZAS_DB_PATH ?? 'data/finanzas-os.sqlite')

if (!existsSync(dbPath)) {
  throw new Error('No se encontro la base SQLite local para diagnostico agregado.')
}

function populated(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

function increment(object, key, amount = 1) {
  object[key] = (object[key] ?? 0) + amount
}

function topEntries(record, limit = 12) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit))
}

function recordCoverage(target, key, label, summary) {
  if (!target[key]) {
    target[key] = {
      label,
      documents: 0,
      detectedFields: 0,
      expectedFields: 0,
      completeness: 0,
      legacyDocuments: 0,
      missingFields: {},
    }
  }
  const bucket = target[key]
  bucket.documents += 1
  bucket.detectedFields += summary.detectedFields
  bucket.expectedFields += summary.expectedFields
  if (summary.isLegacy) bucket.legacyDocuments += 1
  for (const field of summary.missing) {
    increment(bucket.missingFields, field)
  }
}

function docSummary(doc) {
  const kind = doc.kind ?? 'unknown'
  const extracted = doc.extracted && typeof doc.extracted === 'object' ? doc.extracted : {}
  const expected = expectedFieldSpecsForExtracted(kind, extracted).map((field) => field.key)
  const missing = expected.filter((field) => !populated(extracted[field]))
  const storedExpectedFields = Number(extracted.expectedFields ?? 0)
  const expectedFields = expected.length || storedExpectedFields
  const detectedFields = expected.length ? Math.max(0, expected.length - missing.length) : Number(extracted.detectedFields ?? 0)
  const qualitySchemaVersion = Number(extracted.qualitySchemaVersion ?? 0)
  const subtype = documentSubtypeForExtracted(kind, extracted)
  return {
    kind,
    subtype,
    expectedFields,
    detectedFields,
    missing,
    qualitySchemaVersion,
    isLegacy: expected.length > 0 && qualitySchemaVersion === 0 && storedExpectedFields === 0,
    isReviewOnly: doc.status === 'needs_review' && !(doc.sourceTransactionIds?.length ?? 0),
    hasWarnings: (doc.warnings?.length ?? 0) > 0,
    hasAppliedRows: (doc.sourceTransactionIds?.length ?? 0) > 0 || Number(extracted.appliedRows ?? 0) > 0,
  }
}

function analyzeProfiles(profiles) {
  const fingerprintCounts = {}
  const result = {
    policy: 'aggregate-only; no filenames, no raw OCR text, no merchants, no account identifiers',
    dbFile: basename(dbPath),
    profiles: profiles.length,
    documents: 0,
    transactions: 0,
    accounts: 0,
    byKind: {},
    bySubtype: {},
    byStatus: {},
    byFileType: {},
    qualitySchema: {
      current: 0,
      legacy: 0,
      reimportRecommended: 0,
      rawFilesPersisted: false,
      fingerprintedDocuments: 0,
      duplicateFingerprintGroups: 0,
      documentsInDuplicateFingerprintGroups: 0,
    },
    reviewRisk: {
      reviewOnlyDocuments: 0,
      warningDocuments: 0,
      appliedDocuments: 0,
      rejectedDocuments: 0,
    },
    fieldCoverageByKind: {},
    fieldCoverageBySubtype: {},
    topMissingFields: {},
    recommendedActions: [],
  }

  for (const profile of profiles) {
    result.transactions += profile.transactions?.length ?? 0
    result.accounts += profile.accounts?.length ?? 0
    for (const doc of profile.importedDocuments ?? []) {
      const summary = docSummary(doc)
      result.documents += 1
      increment(result.byKind, summary.kind)
      increment(result.bySubtype, summary.subtype.key)
      increment(result.byStatus, doc.status ?? 'unknown')
      increment(result.byFileType, doc.fileType ?? 'unknown')
      if (summary.qualitySchemaVersion > 0 || Number(doc.extracted?.expectedFields ?? 0) > 0) result.qualitySchema.current += 1
      if (summary.isLegacy) result.qualitySchema.legacy += 1
      if (summary.isLegacy || summary.missing.length > 0 || summary.isReviewOnly) result.qualitySchema.reimportRecommended += 1
      if (typeof doc.documentFingerprint === 'string' && doc.documentFingerprint) {
        result.qualitySchema.fingerprintedDocuments += 1
        increment(fingerprintCounts, doc.documentFingerprint)
      }
      if (summary.isReviewOnly) result.reviewRisk.reviewOnlyDocuments += 1
      if (summary.hasWarnings) result.reviewRisk.warningDocuments += 1
      if (summary.hasAppliedRows) result.reviewRisk.appliedDocuments += 1
      if (doc.status === 'rejected') result.reviewRisk.rejectedDocuments += 1

      recordCoverage(result.fieldCoverageByKind, summary.kind, documentKindLabels[summary.kind] ?? summary.kind, summary)
      recordCoverage(result.fieldCoverageBySubtype, summary.subtype.key, summary.subtype.label, summary)
      for (const field of summary.missing) {
        increment(result.topMissingFields, `${summary.subtype.key}.${field}`)
      }
    }
  }

  for (const coverage of [result.fieldCoverageByKind, result.fieldCoverageBySubtype]) {
    for (const bucket of Object.values(coverage)) {
      bucket.completeness = bucket.expectedFields ? Number((bucket.detectedFields / bucket.expectedFields).toFixed(2)) : 0
      bucket.missingFields = topEntries(bucket.missingFields, 8)
    }
  }
  result.topMissingFields = topEntries(result.topMissingFields, 16)
  const duplicateFingerprintGroupSizes = Object.values(fingerprintCounts).filter((count) => count > 1)
  result.qualitySchema.duplicateFingerprintGroups = duplicateFingerprintGroupSizes.length
  result.qualitySchema.documentsInDuplicateFingerprintGroups = duplicateFingerprintGroupSizes.reduce((sum, count) => sum + count, 0)

  if (result.qualitySchema.legacy > 0) {
    result.recommendedActions.push('Reimportar documentos legacy para recapturar texto con el extractor actual; la app no guarda archivos crudos.')
  }
  if ((result.byKind.credit_card_statement ?? 0) > 0 && Object.keys(result.fieldCoverageByKind.credit_card_statement?.missingFields ?? {}).length > 0) {
    result.recommendedActions.push('Priorizar estados de tarjeta: corte, fecha limite, pagos, cargos y conciliacion impactan deuda y pago minimo.')
  }
  if ((result.byKind.bank_statement ?? 0) > 0 && Object.keys(result.fieldCoverageByKind.bank_statement?.missingFields ?? {}).length > 0) {
    result.recommendedActions.push('Priorizar estados bancarios/nomina: saldos, depositos, retiros y conciliacion evitan inflar ingresos.')
  }
  if ((result.byKind.investment_statement ?? 0) > 0 && Object.keys(result.fieldCoverageByKind.investment_statement?.missingFields ?? {}).length > 0) {
    result.recommendedActions.push('Priorizar inversiones: separar portafolio, efectivo, rendimiento, posiciones y liquidacion.')
  }
  if (Object.keys(result.fieldCoverageBySubtype).length > Object.keys(result.fieldCoverageByKind).length) {
    result.recommendedActions.push('Usar cobertura por subtipo para separar Nu/SPEI/nomina, tarjetas, GBM, Cetesdirecto, PPR y AFORE.')
  }
  if (!result.recommendedActions.length) {
    result.recommendedActions.push('Mantener pruebas sinteticas y revisar documentos nuevos con chips de calidad por documento.')
  }

  return result
}

const database = new DatabaseSync(dbPath, {
  readOnly: true,
  defensive: true,
})

try {
  const profiles = database.prepare('SELECT data_json FROM profiles ORDER BY updated_at DESC').all().map((row) => JSON.parse(row.data_json))
  const diagnostic = analyzeProfiles(profiles)
  const json = JSON.stringify(diagnostic, null, 2)

  if (writeReport) {
    const reportPath = outputPath || defaultReportPath
    mkdirSync(dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, `${json}\n`)
    console.log(JSON.stringify({ ok: true, report: relative(process.cwd(), reportPath), ...diagnostic }, null, 2))
  } else {
    console.log(json)
  }
} finally {
  database.close()
}
