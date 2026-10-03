import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import {
  hydrateProfileDocuments,
  serializeProfileWithoutDocuments,
  syncProfileDocumentPayloads,
} from './profile-document-storage.mjs'

test('document payload storage preserves legacy reads, order, duplicates and unchanged rows', () => {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  database.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      documents_storage_version INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE profile_document_payloads (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      document_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, position)
    ) STRICT;
  `)

  const legacy = { id: 'legacy', importedDocuments: [{ id: 'embedded' }] }
  assert.deepEqual(
    hydrateProfileDocuments(database, { id: legacy.id, data_json: JSON.stringify(legacy), documents_storage_version: 0 }),
    legacy,
  )

  const profile = {
    id: 'incremental',
    name: 'Sintetico',
    importedDocuments: [
      { id: 'duplicate', status: 'processed' },
      { id: 'duplicate', status: 'needs_review' },
    ],
  }
  database.prepare(`
    INSERT INTO profiles (id, data_json, documents_storage_version)
    VALUES (?, ?, 1)
  `).run(profile.id, serializeProfileWithoutDocuments(profile))
  assert.equal(syncProfileDocumentPayloads(database, profile), 2)
  assert.deepEqual(
    hydrateProfileDocuments(database, database.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id)),
    profile,
  )

  const updated = {
    ...profile,
    importedDocuments: [profile.importedDocuments[0], { ...profile.importedDocuments[1], status: 'processed' }],
  }
  assert.equal(syncProfileDocumentPayloads(database, updated), 1)
  assert.deepEqual(
    database.prepare('SELECT revision FROM profile_document_payloads ORDER BY position').all()
      .map(({ revision }) => Number(revision)),
    [1, 2],
  )

  database.prepare('DELETE FROM profile_document_payloads WHERE profile_id = ? AND position = 1').run(profile.id)
  assert.throws(
    () => hydrateProfileDocuments(database, database.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id)),
    /incompletos/,
  )
  syncProfileDocumentPayloads(database, updated)
  database.prepare(`
    UPDATE profile_document_payloads
    SET document_id = 'mismatch'
    WHERE profile_id = ? AND position = 0
  `).run(profile.id)
  assert.throws(
    () => hydrateProfileDocuments(database, database.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id)),
    /integridad/,
  )

  database.prepare('DELETE FROM profiles WHERE id = ?').run(profile.id)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM profile_document_payloads').get().count, 0)
  database.close()
})
