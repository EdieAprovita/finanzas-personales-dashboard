import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('migration 5 keeps a populated version 4 profile readable and converts it on write', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finanzas-document-migration-'))
  process.env.FINANZAS_DB_PATH = join(directory, 'synthetic.sqlite')
  let database
  try {
    const setup = await import(`./db.mjs?setup=${Date.now()}`)
    database = setup.database
    const profile = {
      schemaVersion: 2,
      reportingCurrency: 'MXN',
      id: 'legacy-v4',
      name: 'Perfil v4',
      description: '',
      grossMonthlyIncome: 0,
      netMonthlyIncome: 0,
      accounts: [],
      transactions: [],
      debts: [],
      goals: [],
      budgets: [],
      monthlySnapshots: [],
      importedDocuments: [{
        id: 'legacy-document',
        fileName: 'legacy.csv',
        fileType: 'csv',
        importedAt: '2026-10-02T12:00:00.000Z',
        status: 'processed',
        summary: 'Documento sintetico v4',
        extractedRows: 1,
      }],
      investmentPositions: [],
    }
    const snapshot = JSON.stringify(profile)
    database.prepare('INSERT INTO profiles (id, name, data_json) VALUES (?, ?, ?)')
      .run(profile.id, profile.name, snapshot)
    database.prepare(`
      INSERT INTO profile_import_undo
        (profile_id, batch_id, previous_data_json, previous_sha256, applied_revision)
      VALUES (?, 'legacy-batch', ?, 'synthetic-sha256', 1)
    `).run(profile.id, snapshot)
    database.exec(`
      DROP TABLE profile_document_payloads;
      DELETE FROM schema_migrations WHERE version = 5;
      ALTER TABLE profiles DROP COLUMN documents_storage_version;
    `)
    database.close()
    database = undefined

    const upgraded = await import(`./db.mjs?upgrade=${Date.now()}`)
    database = upgraded.database
    const legacyRow = database.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id)
    assert.equal(legacyRow.documents_storage_version, 0)
    assert.deepEqual(upgraded.rowToProfile(legacyRow), profile)
    assert.equal(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 5)
    assert.equal(database.prepare('SELECT previous_data_json FROM profile_import_undo WHERE profile_id = ?').get(profile.id).previous_data_json, snapshot)

    database.prepare(`
      UPDATE profiles
      SET data_json = ?, documents_storage_version = 1
      WHERE id = ?
    `).run(upgraded.profileDataJson(profile), profile.id)
    upgraded.syncProfileDocumentPayloads(profile)
    assert.deepEqual(
      upgraded.rowToProfile(database.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id)),
      profile,
    )
  } finally {
    database?.close()
    delete process.env.FINANZAS_DB_PATH
    await rm(directory, { recursive: true, force: true })
  }
})
