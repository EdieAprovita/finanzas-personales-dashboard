import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { MAX_BACKUP_ENVELOPE_BYTES, createEncryptedBackup, restoreEncryptedBackup } from './recovery.mjs'
import { hydrateProfileDocuments, serializeProfileWithoutDocuments } from './profile-document-storage.mjs'

function syntheticDatabase(path, marker) {
  const database = new DatabaseSync(path)
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
    CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, data_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1) STRICT;
    CREATE TABLE profile_import_undo (
      profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL,
      previous_data_json TEXT,
      previous_sha256 TEXT,
      applied_revision INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4);
  `)
  database.prepare('INSERT INTO profiles (id, name, data_json) VALUES (?, ?, ?)').run('synthetic', 'Perfil sintetico', JSON.stringify({ marker }))
  database.prepare(`
    INSERT INTO profile_import_undo (profile_id, batch_id, previous_data_json, previous_sha256, applied_revision)
    VALUES (?, ?, ?, ?, ?)
  `).run('synthetic', 'synthetic-batch', JSON.stringify({ marker: 'before-import' }), 'synthetic-sha256', 1)
  return database
}

test('encrypted backup restores a valid SQLite snapshot and rotates old copies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finanzas-recovery-'))
  const sourcePath = join(directory, 'source.sqlite')
  const database = syntheticDatabase(sourcePath, 'SYNTHETIC_PRIVATE_MARKER')
  const secret = 'synthetic-backup-secret-with-at-least-32-bytes'
  let latest
  for (let index = 0; index < 3; index += 1) {
    latest = await createEncryptedBackup({ database, sourcePath, outputDirectory: join(directory, 'backups'), secret, keep: 2 })
  }
  database.close()
  const backupBytes = await readFile(latest.outputPath)
  assert.equal(backupBytes.includes(Buffer.from('SQLite format 3')), false)
  assert.equal(backupBytes.includes(Buffer.from('SYNTHETIC_PRIVATE_MARKER')), false)
  assert.equal((await readdir(join(directory, 'backups'))).filter((name) => name.endsWith('.backup.json')).length, 2)

  const restoredPath = join(directory, 'restored.sqlite')
  await restoreEncryptedBackup({ inputPath: latest.outputPath, outputPath: restoredPath, secret })
  const restored = new DatabaseSync(restoredPath, { readOnly: true })
  assert.match(restored.prepare('SELECT data_json FROM profiles WHERE id = ?').get('synthetic').data_json, /SYNTHETIC_PRIVATE_MARKER/)
  assert.equal(restored.prepare('SELECT batch_id FROM profile_import_undo WHERE profile_id = ?').get('synthetic').batch_id, 'synthetic-batch')
  assert.equal(restored.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 4)
  restored.close()

  await assert.rejects(
    restoreEncryptedBackup({ inputPath: latest.outputPath, outputPath: join(directory, 'wrong.sqlite'), secret: `${secret}-wrong` }),
  )
  const altered = JSON.parse(backupBytes.toString('utf8'))
  altered.ciphertext = `${altered.ciphertext.slice(0, -4)}AAAA`
  const alteredPath = join(directory, 'altered.backup.json')
  await writeFile(alteredPath, JSON.stringify(altered))
  await assert.rejects(
    restoreEncryptedBackup({ inputPath: alteredPath, outputPath: join(directory, 'altered.sqlite'), secret }),
  )

  const oversizedPath = join(directory, 'oversized.backup.json')
  await writeFile(oversizedPath, '{}')
  await truncate(oversizedPath, MAX_BACKUP_ENVELOPE_BYTES + 1)
  await assert.rejects(
    restoreEncryptedBackup({ inputPath: oversizedPath, outputPath: join(directory, 'oversized.sqlite'), secret }),
    /excede el limite permitido/,
  )
})

test('encrypted backup preserves incremental document payloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finanzas-recovery-incremental-'))
  const sourcePath = join(directory, 'source.sqlite')
  const database = new DatabaseSync(sourcePath, { enableForeignKeyConstraints: true })
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
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
    INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5);
  `)
  const profile = {
    id: 'synthetic-incremental',
    name: 'Perfil incremental',
    importedDocuments: [{ id: 'document-1', summary: 'SYNTHETIC_INCREMENTAL_MARKER' }],
  }
  database.prepare(`
    INSERT INTO profiles (id, name, data_json, documents_storage_version)
    VALUES (?, ?, ?, 1)
  `).run(profile.id, profile.name, serializeProfileWithoutDocuments(profile))
  database.prepare(`
    INSERT INTO profile_document_payloads (profile_id, position, document_id, payload_json)
    VALUES (?, 0, ?, ?)
  `).run(profile.id, profile.importedDocuments[0].id, JSON.stringify(profile.importedDocuments[0]))

  const secret = 'synthetic-incremental-secret-at-least-32-bytes'
  const backup = await createEncryptedBackup({
    database,
    sourcePath,
    outputDirectory: join(directory, 'backups'),
    secret,
  })
  database.close()
  const restoredPath = join(directory, 'restored.sqlite')
  await restoreEncryptedBackup({ inputPath: backup.outputPath, outputPath: restoredPath, secret })
  const restored = new DatabaseSync(restoredPath, { readOnly: true })
  try {
    assert.deepEqual(
      hydrateProfileDocuments(restored, restored.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id)),
      profile,
    )
  } finally {
    restored.close()
  }

  const invalidPath = join(directory, 'invalid-v5.sqlite')
  const invalid = new DatabaseSync(invalidPath)
  invalid.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      documents_storage_version INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5);
  `)
  await assert.rejects(
    createEncryptedBackup({
      database: invalid,
      sourcePath: invalidPath,
      outputDirectory: join(directory, 'invalid-backups'),
      secret,
    }),
    /payloads documentales/,
  )
  invalid.close()
})
