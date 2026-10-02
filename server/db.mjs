import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { knowledgeEntries, knowledgeSources } from './knowledge-seed.mjs'
import { migrateProfile } from './profile-schema.mjs'
import {
  hydrateProfileDocuments,
  serializeProfileWithoutDocuments,
  syncProfileDocumentPayloads as syncDocumentPayloads,
} from './profile-document-storage.mjs'

export const dbPath = resolve(process.cwd(), process.env.FINANZAS_DB_PATH ?? 'data/finanzas-os.sqlite')
const usesDefaultDbPath = !process.env.FINANZAS_DB_PATH
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
if (usesDefaultDbPath) chmodSync(dirname(dbPath), 0o700)

export const database = new DatabaseSync(dbPath, {
  enableForeignKeyConstraints: true,
  timeout: 5000,
  defensive: true,
})

function restrictDatabaseFiles() {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!existsSync(path)) continue
    try {
      chmodSync(path, 0o600)
    } catch {
      console.warn(`No se pudo restringir permisos de SQLite: ${path}`)
    }
  }
}

restrictDatabaseFiles()

database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE TABLE IF NOT EXISTS knowledge_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    publisher TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS knowledge_entries (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    title TEXT NOT NULL,
    aliases_json TEXT NOT NULL,
    summary TEXT NOT NULL,
    patterns_json TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    change_json TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_knowledge_domain ON knowledge_entries(domain);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, changed_at DESC);
`)

const MIGRATIONS = [
  {
    version: 1,
    apply() {
      database.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          fingerprint TEXT,
          file_name TEXT NOT NULL,
          file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv', 'xml', 'image')),
          document_kind TEXT NOT NULL DEFAULT 'unknown',
          document_subtype TEXT,
          status TEXT NOT NULL CHECK (status IN ('processed', 'needs_review', 'rejected')),
          extractor_version TEXT,
          source_hash TEXT,
          period_start TEXT,
          period_end TEXT,
          currency TEXT CHECK (currency IS NULL OR currency IN ('MXN', 'USD')),
          quality_score REAL CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1)),
          source_blob_path TEXT,
          source_blob_status TEXT NOT NULL DEFAULT 'missing'
            CHECK (source_blob_status IN ('available', 'missing', 'unreadable')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(profile_id, fingerprint)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS document_fields (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          field_key TEXT NOT NULL,
          raw_value TEXT,
          normalized_value TEXT,
          currency TEXT CHECK (currency IS NULL OR currency IN ('MXN', 'USD')),
          confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
          source_page INTEGER,
          source_bbox TEXT,
          review_state TEXT NOT NULL DEFAULT 'pending'
            CHECK (review_state IN ('pending', 'approved', 'rejected')),
          UNIQUE(document_id, field_key)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS document_rows (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          row_index INTEGER NOT NULL,
          row_type TEXT NOT NULL,
          date TEXT,
          description TEXT,
          amount_minor INTEGER,
          currency TEXT NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN', 'USD')),
          raw_payload TEXT NOT NULL,
          confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
          review_state TEXT NOT NULL DEFAULT 'pending'
            CHECK (review_state IN ('pending', 'approved', 'rejected')),
          transaction_id TEXT,
          UNIQUE(document_id, row_index, row_type)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS reconciliation_matches (
          id TEXT PRIMARY KEY,
          source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          source_row_id TEXT REFERENCES document_rows(id) ON DELETE CASCADE,
          target_transaction_id TEXT,
          match_type TEXT NOT NULL,
          amount_diff_minor INTEGER,
          date_diff_days INTEGER,
          confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
          status TEXT NOT NULL CHECK (status IN ('matched', 'partial', 'unmatched', 'needs_review')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_document_id, source_row_id, target_transaction_id, match_type)
        ) STRICT;

        CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents(profile_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_documents_fingerprint ON documents(fingerprint);
        CREATE INDEX IF NOT EXISTS idx_document_fields_document ON document_fields(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_rows_document ON document_rows(document_id, row_index);
        CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation_matches(status);
      `)
    },
  },
  {
    version: 2,
    apply() {
      database.exec(`
        CREATE TABLE IF NOT EXISTS transaction_amounts (
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          transaction_id TEXT NOT NULL,
          amount_minor INTEGER NOT NULL,
          currency TEXT NOT NULL CHECK (currency IN ('MXN', 'USD')),
          source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, transaction_id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_transaction_amounts_source
          ON transaction_amounts(source_document_id);
      `)
    },
  },
  {
    version: 3,
    apply() {
      database.exec('ALTER TABLE profiles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;')
    },
  },
  {
    version: 4,
    apply() {
      database.exec(`
        CREATE TABLE profile_import_undo (
          profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
          batch_id TEXT NOT NULL,
          previous_data_json TEXT,
          previous_sha256 TEXT,
          applied_revision INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) STRICT;
      `)
    },
  },
  {
    version: 5,
    apply() {
      database.exec(`
        ALTER TABLE profiles
          ADD COLUMN documents_storage_version INTEGER NOT NULL DEFAULT 0
          CHECK (documents_storage_version IN (0, 1));

        CREATE TABLE profile_document_payloads (
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          position INTEGER NOT NULL CHECK (position >= 0),
          document_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, position)
        ) STRICT;
      `)
    },
  },
]

function applyMigrations() {
  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version)),
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    database.exec('BEGIN')
    try {
      migration.apply()
      database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}

applyMigrations()
restrictDatabaseFiles()

function backupAndMigrateLegacyProfiles() {
  const rows = database.prepare('SELECT id, data_json FROM profiles').all()
  const parsedProfiles = rows.flatMap((row) => {
    try {
      return [{ id: row.id, profile: JSON.parse(row.data_json) }]
    } catch {
      return []
    }
  })
  const invalidJsonCount = rows.length - parsedProfiles.length
  if (invalidJsonCount > 0) {
    console.warn(`SQLite conserva ${invalidJsonCount} perfil(es) con JSON invalido; se dejan en cuarentena logica.`)
  }
  const legacyProfiles = parsedProfiles.filter(
    ({ profile }) => profile && typeof profile === 'object' && !Array.isArray(profile) && (profile.schemaVersion !== 2 || profile.reportingCurrency !== 'MXN'),
  )
  if (legacyProfiles.length === 0) return

  const backupDirectory = resolve(dirname(dbPath), 'backups')
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
  const backupPath = resolve(backupDirectory, `finanzas-os-before-profile-v2-${Date.now()}.sqlite`)
  const escapedBackupPath = backupPath.replace(/'/g, "''")
  database.exec(`VACUUM INTO '${escapedBackupPath}'`)
  chmodSync(backupPath, 0o600)

  const update = database.prepare('UPDATE profiles SET name = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  database.exec('BEGIN')
  try {
    for (const { id, profile } of legacyProfiles) {
      const migratedProfile = migrateProfile(profile)
      update.run(migratedProfile.name, JSON.stringify(migratedProfile), id)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

backupAndMigrateLegacyProfiles()

const DOCUMENT_STATUS = new Set(['processed', 'needs_review', 'rejected'])
const DOCUMENT_TYPES = new Set(['pdf', 'csv', 'xml', 'image'])
const CURRENCIES = new Set(['MXN', 'USD'])
const REVIEW_STATES = new Set(['pending', 'approved', 'rejected'])

function nullableString(value, maxLength = 1000) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const result = String(value).trim()
  return result ? result.slice(0, maxLength) : null
}

function existingFilePath(value) {
  const path = nullableString(value, 1000)
  if (!path) return null
  try {
    return existsSync(path) && statSync(path).isFile() ? path : null
  } catch {
    return null
  }
}

function validCurrency(value) {
  const currency = nullableString(value, 3)
  return currency && CURRENCIES.has(currency) ? currency : null
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1')
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function amountMinor(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value)
    .replace(/[$,\s]/g, '')
    .replace(/\(([^)]+)\)/, '-$1')
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return null
  const sign = match[1] === '-' ? -1 : 1
  const whole = Number(match[2])
  if (!Number.isSafeInteger(whole)) return null
  const decimals = match[3] ?? ''
  let cents = Number((decimals.slice(0, 2) + '00').slice(0, 2))
  if (decimals[2] && Number(decimals[2]) >= 5) cents += 1
  return sign * (whole * 100 + cents)
}

function confidenceValue(value) {
  const number = numericValue(value)
  return number === null ? null : Math.min(1, Math.max(0, number))
}

function extractedValue(extracted, keys) {
  for (const key of keys) {
    const value = extracted?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function normalizedDate(value) {
  const string = nullableString(value, 40)
  if (!string) return null
  const match = string.match(/(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

function dateDifferenceDays(left, right) {
  if (!left || !right) return null
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null
  return Math.round(Math.abs(leftTime - rightTime) / 86_400_000)
}

function serializedValue(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.slice(0, 10000)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value).slice(0, 10000)
  } catch {
    return null
  }
}

function sourceRowsForDocument(document) {
  const extracted = document.extracted ?? {}
  const candidates = [
    ['statement_movement', extracted.statementMovementRows],
    ['bank_movement', extracted.bankMovementRows],
    ['card_movement', extracted.cardMovementRows],
    ['card_activity', extracted.cardActivityRows],
    ['card_charge', extracted.cardChargesRows],
    ['card_payment', extracted.cardPaymentsRows],
    ['payroll_deposit', extracted.payrollDepositRows],
    ['deposit', extracted.depositRows],
    ['withdrawal', extracted.withdrawalRows],
    ['movement', extracted.movementRows],
    ['payroll_perception', extracted.perceptionRows],
    ['payroll_deduction', extracted.deductionRows],
    ['payroll_other_payment', extracted.otherPaymentRows],
    ['row', extracted.rows],
  ]
  const seen = new Set()
  return candidates.flatMap(([rowType, value]) => {
    if (!Array.isArray(value) || value.length === 0) return []
    const fingerprint = serializedValue(value)
    if (fingerprint && seen.has(fingerprint)) return []
    if (fingerprint) seen.add(fingerprint)
    return value.map((row, index) => ({ rowType, row, index }))
  })
}

function rowAmount(row) {
  if (!row || typeof row !== 'object') return null
  const record = row
  const explicitAmount = extractedValue(record, ['amount', 'importe', 'monto', 'value', 'total'])
  if (explicitAmount !== null) return amountMinor(explicitAmount)
  const debit = amountMinor(extractedValue(record, ['debit', 'cargo', 'withdrawal']))
  if (debit !== null && debit !== 0) return -Math.abs(debit)
  const credit = amountMinor(extractedValue(record, ['credit', 'abono', 'deposit']))
  return credit === null ? null : Math.abs(credit)
}

function rowDescription(row) {
  if (!row || typeof row !== 'object') return null
  return nullableString(extractedValue(row, ['description', 'concept', 'merchant', 'name', 'text']), 500)
}

function rowDate(row) {
  if (!row || typeof row !== 'object') return null
  return normalizedDate(extractedValue(row, ['date', 'transactionDate', 'paymentDate', 'fecha']))
}

function syncDocumentFields(document) {
  const previousReviewStates = new Map(
    database.prepare('SELECT field_key, review_state FROM document_fields WHERE document_id = ?').all(document.id)
      .map((row) => [row.field_key, row.review_state]),
  )
  database.prepare('DELETE FROM document_fields WHERE document_id = ?').run(document.id)
  const extracted = document.extracted ?? {}
  const fieldConfidences = document.fieldConfidences && typeof document.fieldConfidences === 'object'
    ? document.fieldConfidences
    : extracted.fieldConfidences && typeof extracted.fieldConfidences === 'object'
      ? extracted.fieldConfidences
      : {}
  const fieldSources = extracted.fieldSources && typeof extracted.fieldSources === 'object'
    ? extracted.fieldSources
    : {}
  const insert = database.prepare(`
    INSERT INTO document_fields
      (id, document_id, field_key, raw_value, normalized_value, currency, confidence,
       source_page, source_bbox, review_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const [fieldKey, value] of Object.entries(extracted)) {
    if (fieldKey === 'textPreview' && typeof value === 'string' && value.length > 2000) continue
    const rawValue = serializedValue(value)
    if (rawValue === null) continue
    const source = fieldSources[fieldKey]
    const sourcePage = source && typeof source === 'object' ? numericValue(source.page) : null
    const sourceBBox = source && typeof source === 'object' ? serializedValue(source.bbox) : null
    const reviewState = REVIEW_STATES.has(value?.reviewState)
      ? value.reviewState
      : previousReviewStates.get(fieldKey) ?? 'pending'
    insert.run(
      `${document.id}:field:${fieldKey}`,
      document.id,
      fieldKey,
      rawValue,
      rawValue,
      validCurrency(value?.currency ?? extracted.currency ?? extracted.detectedCurrency),
      confidenceValue(fieldConfidences[fieldKey] ?? document.confidence),
      sourcePage,
      sourceBBox,
      reviewState,
    )
  }
}

function syncDocumentRows(document, transactionsById, accountCurrencies) {
  const previousReviewStates = new Map(
    database.prepare('SELECT id, review_state FROM document_rows WHERE document_id = ?').all(document.id)
      .map((row) => [row.id, row.review_state]),
  )
  database.prepare('DELETE FROM reconciliation_matches WHERE source_document_id = ?').run(document.id)
  database.prepare('DELETE FROM document_rows WHERE document_id = ?').run(document.id)
  const rows = sourceRowsForDocument(document)
  const defaultCurrency = validCurrency(
    document.currency ?? extractedValue(document.extracted, ['currency', 'detectedCurrency', 'cardActivityCurrency']),
  ) ?? 'MXN'
  const insert = database.prepare(`
    INSERT INTO document_rows
      (id, document_id, row_index, row_type, date, description, amount_minor, currency,
       raw_payload, confidence, review_state, transaction_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const matchInsert = database.prepare(`
    INSERT INTO reconciliation_matches
      (id, source_document_id, source_row_id, target_transaction_id, match_type,
       amount_diff_minor, date_diff_days, confidence, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const matchedIds = Array.isArray(document.extracted?.matchedTransactionIds)
    ? document.extracted.matchedTransactionIds
    : document.sourceTransactionIds ?? []
  let matchedIdIndex = 0
  for (const { rowType, row, index } of rows) {
    const record = row && typeof row === 'object' ? row : {}
    const rowId = `${document.id}:${rowType}:${index}`
    const candidateTransactionId = nullableString(record.transactionId ?? matchedIds[matchedIdIndex], 160)
    const targetTransaction = candidateTransactionId ? transactionsById.get(candidateTransactionId) : null
    const transactionId = targetTransaction ? candidateTransactionId : null
    matchedIdIndex += 1
    const reviewState = REVIEW_STATES.has(record.reviewState)
      ? record.reviewState
      : previousReviewStates.get(rowId) ?? 'pending'
    const sourceAmountMinor = rowAmount(record)
    const targetAmountMinor = targetTransaction ? amountMinor(targetTransaction.amount) : null
    const amountDifference = sourceAmountMinor !== null && targetAmountMinor !== null
      ? sourceAmountMinor - targetAmountMinor
      : null
    const sourceDate = rowDate(record)
    const targetDate = normalizedDate(targetTransaction?.date)
    const dateDifference = dateDifferenceDays(sourceDate, targetDate)
    const sourceCurrency = validCurrency(record.currency) ?? defaultCurrency
    const targetCurrency = targetTransaction ? accountCurrencies.get(targetTransaction.accountId) : null
    insert.run(
      rowId,
      document.id,
      index,
      rowType,
      rowDate(record),
      rowDescription(record),
      rowAmount(record),
      sourceCurrency,
      serializedValue(record) ?? '{}',
      confidenceValue(record.confidence ?? document.confidence),
      reviewState,
      transactionId,
    )
    if (candidateTransactionId) {
      const status = !targetTransaction
        ? 'unmatched'
        : document.status !== 'processed'
          ? 'needs_review'
          : sourceCurrency === targetCurrency && amountDifference === 0 && (dateDifference === null || dateDifference <= 7)
            ? 'matched'
            : 'needs_review'
      matchInsert.run(
        `${document.id}:match:${rowId}:${candidateTransactionId}`,
        document.id,
        rowId,
        candidateTransactionId,
        'source_transaction',
        amountDifference,
        dateDifference,
        confidenceValue(record.confidence ?? document.confidence),
        status,
      )
    }
  }
}

function documentPeriod(document) {
  const extracted = document.extracted ?? {}
  return {
    start: normalizedDate(document.periodStart ?? extractedValue(extracted, [
      'periodStart', 'statementPeriodStart', 'startDate', 'paymentPeriodStart', 'fechaInicialPago',
    ])),
    end: normalizedDate(document.periodEnd ?? extractedValue(extracted, [
      'periodEnd', 'statementPeriodEnd', 'endDate', 'paymentPeriodEnd', 'fechaFinalPago',
    ])),
  }
}

function syncTransactionAmounts(profile) {
  const transactions = Array.isArray(profile.transactions) ? profile.transactions : []
  const accountCurrencies = new Map(
    (profile.accounts ?? []).map((account) => [account.id, validCurrency(account.currency) ?? 'MXN']),
  )
  const sourceDocumentByTransaction = new Map()
  for (const document of profile.importedDocuments ?? []) {
    const transactionIds = [
      ...(document.sourceTransactionIds ?? []),
      ...(Array.isArray(document.extracted?.matchedTransactionIds) ? document.extracted.matchedTransactionIds : []),
    ]
    for (const transactionId of transactionIds) sourceDocumentByTransaction.set(transactionId, document.id)
  }
  const currentIds = new Set(transactions.map((transaction) => transaction.id))
  const existing = database.prepare('SELECT transaction_id FROM transaction_amounts WHERE profile_id = ?').all(profile.id)
  const remove = database.prepare('DELETE FROM transaction_amounts WHERE profile_id = ? AND transaction_id = ?')
  for (const row of existing) {
    if (!currentIds.has(row.transaction_id)) remove.run(profile.id, row.transaction_id)
  }
  const upsert = database.prepare(`
    INSERT INTO transaction_amounts
      (profile_id, transaction_id, amount_minor, currency, source_document_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, transaction_id) DO UPDATE SET
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      source_document_id = excluded.source_document_id,
      updated_at = CURRENT_TIMESTAMP
  `)
  for (const transaction of transactions) {
    const minor = amountMinor(transaction.amount)
    if (minor === null) continue
    upsert.run(
      profile.id,
      transaction.id,
      minor,
      accountCurrencies.get(transaction.accountId) ?? 'MXN',
      sourceDocumentByTransaction.get(transaction.id) ?? null,
    )
  }
}

export function syncProfileDocuments(profile) {
  const documents = Array.isArray(profile.importedDocuments) ? profile.importedDocuments : []
  const transactionsById = new Map((profile.transactions ?? []).map((transaction) => [transaction.id, transaction]))
  const accountCurrencies = new Map(
    (profile.accounts ?? []).map((account) => [account.id, validCurrency(account.currency) ?? 'MXN']),
  )
  const existing = database.prepare('SELECT id FROM documents WHERE profile_id = ?').all(profile.id)
  const currentIds = new Set(documents.map((document) => document.id))
  const remove = database.prepare('DELETE FROM documents WHERE profile_id = ? AND id = ?')
  for (const row of existing) {
    if (!currentIds.has(row.id)) remove.run(profile.id, row.id)
  }

  const upsert = database.prepare(`
    INSERT INTO documents
      (id, profile_id, fingerprint, file_name, file_type, document_kind, document_subtype,
       status, extractor_version, source_hash, period_start, period_end, currency, quality_score,
       source_blob_path, source_blob_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      profile_id = excluded.profile_id,
      fingerprint = excluded.fingerprint,
      file_name = excluded.file_name,
      file_type = excluded.file_type,
      document_kind = excluded.document_kind,
      document_subtype = excluded.document_subtype,
      status = excluded.status,
      extractor_version = excluded.extractor_version,
      source_hash = excluded.source_hash,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      currency = excluded.currency,
      quality_score = excluded.quality_score,
      source_blob_path = excluded.source_blob_path,
      source_blob_status = excluded.source_blob_status,
      updated_at = CURRENT_TIMESTAMP
  `)
  const seenFingerprints = new Set()
  for (const document of documents) {
    const extracted = document.extracted ?? {}
    const period = documentPeriod(document)
    const fileType = DOCUMENT_TYPES.has(document.fileType) ? document.fileType : 'image'
    const status = DOCUMENT_STATUS.has(document.status) ? document.status : 'needs_review'
    const sourceBlobPath = existingFilePath(document.sourceBlobPath)
    const sourceHash = nullableString(document.sourceHash ?? document.documentFingerprint, 256)
    const fingerprint = nullableString(document.documentFingerprint, 256)
    if (fingerprint && seenFingerprints.has(fingerprint)) continue
    if (fingerprint) seenFingerprints.add(fingerprint)
    const qualityScore = confidenceValue(extracted.qualityScore ?? document.confidence)
    upsert.run(
      document.id,
      profile.id,
      fingerprint,
      nullableString(document.fileName, 300) ?? document.id,
      fileType,
      nullableString(document.kind, 80) ?? 'unknown',
      nullableString(extracted.documentSubtype, 240),
      status,
      nullableString(document.extractorVersion ?? extracted.extractorVersion ?? extracted.qualitySchemaVersion, 64),
      sourceHash,
      period.start,
      period.end,
      validCurrency(document.currency ?? extracted.currency ?? extracted.detectedCurrency),
      qualityScore,
      sourceBlobPath,
      sourceBlobPath ? 'available' : 'missing',
    )
    syncDocumentFields(document)
    syncDocumentRows(document, transactionsById, accountCurrencies)
  }
  syncTransactionAmounts(profile)
}

export function listProfileDocuments(profileId) {
  return database.prepare(`
    SELECT d.*, COUNT(DISTINCT f.id) AS field_count,
      COUNT(DISTINCT r.id) AS row_count,
      COUNT(DISTINCT CASE WHEN m.status IN ('needs_review', 'partial', 'unmatched') THEN m.id END) AS pending_matches
    FROM documents d
    LEFT JOIN document_fields f ON f.document_id = d.id
    LEFT JOIN document_rows r ON r.document_id = d.id
    LEFT JOIN reconciliation_matches m ON m.source_document_id = d.id
    WHERE d.profile_id = ?
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `).all(profileId)
}

export function listProfileReconciliation(profileId) {
  return database.prepare(`
    SELECT m.*, d.profile_id, d.file_name, r.row_index, r.date, r.description,
      r.amount_minor, r.currency
    FROM reconciliation_matches m
    JOIN documents d ON d.id = m.source_document_id
    LEFT JOIN document_rows r ON r.id = m.source_row_id
    WHERE d.profile_id = ?
    ORDER BY m.created_at DESC
  `).all(profileId)
}

export function listProfileTransactionAmounts(profileId) {
  return database.prepare(`
    SELECT transaction_id, amount_minor, currency, source_document_id, updated_at
    FROM transaction_amounts
    WHERE profile_id = ?
    ORDER BY updated_at DESC, transaction_id
  `).all(profileId)
}

export function seedKnowledge() {
  const sourceInsert = database.prepare(`
    INSERT INTO knowledge_sources (id, name, url, publisher, retrieved_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      publisher = excluded.publisher,
      retrieved_at = excluded.retrieved_at
  `)
  const entryInsert = database.prepare(`
    INSERT INTO knowledge_entries (
      id, domain, title, aliases_json, summary, patterns_json, fields_json, source_ids_json, confidence
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      domain = excluded.domain,
      title = excluded.title,
      aliases_json = excluded.aliases_json,
      summary = excluded.summary,
      patterns_json = excluded.patterns_json,
      fields_json = excluded.fields_json,
      source_ids_json = excluded.source_ids_json,
      confidence = excluded.confidence,
      updated_at = CURRENT_TIMESTAMP
  `)

  database.exec('BEGIN')
  try {
    for (const source of knowledgeSources) {
      sourceInsert.run(source.id, source.name, source.url, source.publisher, source.retrievedAt)
    }
    for (const entry of knowledgeEntries) {
      entryInsert.run(
        entry.id,
        entry.domain,
        entry.title,
        JSON.stringify(entry.aliases),
        entry.summary,
        JSON.stringify(entry.patterns),
        JSON.stringify(entry.fields),
        JSON.stringify(entry.sourceIds),
        entry.confidence,
      )
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

seedKnowledge()

export function writeAudit(entityType, entityId, action, change) {
  database
    .prepare('INSERT INTO audit_log (id, entity_type, entity_id, action, change_json) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), entityType, entityId, action, JSON.stringify(change))
}

export function profileDataJson(profile) {
  return serializeProfileWithoutDocuments(profile)
}

export function syncProfileDocumentPayloads(profile) {
  return syncDocumentPayloads(database, profile)
}

export function rowToProfile(row) {
  return hydrateProfileDocuments(database, row)
}

export function rowToKnowledge(row) {
  return {
    id: row.id,
    domain: row.domain,
    title: row.title,
    aliases: JSON.parse(row.aliases_json),
    summary: row.summary,
    patterns: JSON.parse(row.patterns_json),
    fields: JSON.parse(row.fields_json),
    sourceIds: JSON.parse(row.source_ids_json),
    confidence: row.confidence,
  }
}
