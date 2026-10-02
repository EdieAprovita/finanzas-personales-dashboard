import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'finanzas-db-schema-'))
process.env.FINANZAS_DB_PATH = join(temporaryDirectory, 'finanzas.sqlite')

try {
  const {
    database,
    listProfileDocuments,
    listProfileReconciliation,
    listProfileTransactionAmounts,
    syncProfileDocuments,
  } = await import('../server/db.mjs')
  const profile = {
    id: 'schema-test',
    name: 'Schema test',
    accounts: [{ id: 'checking', currency: 'MXN' }],
    transactions: [
      { id: 'tx-1', accountId: 'checking', amount: 123.45 },
      { id: 'tx-precise', accountId: 'checking', amount: -1.005 },
    ],
    importedDocuments: [{
      id: 'doc-1',
      documentFingerprint: 'sha256:test',
      fileName: 'bank.csv',
      fileType: 'csv',
      status: 'processed',
      kind: 'bank_statement',
      confidence: 0.9,
      extracted: {
        documentSubtype: 'bank_statement.movements',
        statementMovementRows: [
          { date: '2026-01-02', description: 'Nómina', amount: 123.45, transactionId: 'tx-1' },
          { date: '2026-01-03', description: 'Referencia no encontrada', amount: 10, transactionId: 'bogus' },
        ],
        currency: 'USD',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      },
      sourceTransactionIds: ['tx-1'],
    }],
  }

  database.prepare('INSERT INTO profiles (id, name, data_json) VALUES (?, ?, ?)').run(
    profile.id,
    profile.name,
    JSON.stringify(profile),
  )
  syncProfileDocuments(profile)

  assert.deepEqual(
    database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      .map((row) => ({ version: Number(row.version) })),
    [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }],
  )
  assert.equal(database.prepare('SELECT revision FROM profiles WHERE id = ?').get(profile.id).revision, 1)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM documents').get().count, 1)
  assert.equal(database.prepare('SELECT amount_minor FROM document_rows').get().amount_minor, 12345)
  assert.equal(database.prepare('SELECT currency FROM document_rows').get().currency, 'USD')
  assert.equal(database.prepare("SELECT amount_minor FROM transaction_amounts WHERE transaction_id = 'tx-1'").get().amount_minor, 12345)
  assert.equal(database.prepare("SELECT amount_minor FROM transaction_amounts WHERE transaction_id = 'tx-precise'").get().amount_minor, -101)
  assert.equal(database.prepare("SELECT status FROM reconciliation_matches WHERE target_transaction_id = 'tx-1'").get().status, 'needs_review')
  assert.equal(database.prepare("SELECT status FROM reconciliation_matches WHERE target_transaction_id = 'bogus'").get().status, 'unmatched')
  const documentSummary = listProfileDocuments(profile.id)[0]
  assert.equal(documentSummary.row_count, 2)
  assert.equal(documentSummary.pending_matches, 2)
  assert.equal(listProfileReconciliation(profile.id).length, 2)
  assert.equal(listProfileTransactionAmounts(profile.id).length, 2)
  profile.importedDocuments[0].extracted.currency = 'MXN'
  syncProfileDocuments(profile)
  assert.equal(database.prepare("SELECT status FROM reconciliation_matches WHERE target_transaction_id = 'tx-1'").get().status, 'matched')
  assert.equal(listProfileDocuments(profile.id)[0].pending_matches, 1)
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  console.log('SQLite schema validation passed')
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
