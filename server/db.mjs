import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { knowledgeEntries, knowledgeSources } from './knowledge-seed.mjs'

export const dbPath = resolve(process.cwd(), process.env.FINANZAS_DB_PATH ?? 'data/finanzas-os.sqlite')
mkdirSync(dirname(dbPath), { recursive: true })

export const database = new DatabaseSync(dbPath, {
  enableForeignKeyConstraints: true,
  timeout: 5000,
  defensive: true,
})

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

export function rowToProfile(row) {
  return JSON.parse(row.data_json)
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
