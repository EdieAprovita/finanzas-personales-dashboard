import { createServer } from 'node:http'
import { createHash, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto'
import { basename } from 'node:path'
import {
  database,
  dbPath,
  listProfileDocuments,
  listProfileReconciliation,
  listProfileTransactionAmounts,
  rowToKnowledge,
  rowToProfile,
  syncProfileDocuments,
  writeAudit,
} from './db.mjs'
import { financialProfileSchema, knowledgeExplainRequestSchema, migrateProfile } from './profile-schema.mjs'

const port = Number(process.env.FINANZAS_API_PORT ?? 4147)
const lanMode = process.env.FINANZAS_LAN_MODE === '1'
const accessToken = process.env.FINANZAS_API_TOKEN ?? randomBytes(32).toString('hex')
if (Buffer.byteLength(accessToken) < 32) throw new Error('FINANZAS_API_TOKEN debe tener al menos 32 bytes.')
const expectedAuthorization = Buffer.from(`Bearer ${accessToken}`)

function isAuthenticated(req) {
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string') return false
  const supplied = Buffer.from(authorization)
  return supplied.length === expectedAuthorization.length && timingSafeEqual(supplied, expectedAuthorization)
}

const configuredOrigins = new Set(
  (process.env.FINANZAS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const maxJsonBytes = 2 * 1024 * 1024
const maxProfileJsonBytes = Number(process.env.FINANZAS_MAX_PROFILE_BYTES ?? 16 * 1024 * 1024)
if (!Number.isSafeInteger(maxProfileJsonBytes) || maxProfileJsonBytes < maxJsonBytes || maxProfileJsonBytes > 64 * 1024 * 1024) {
  throw new Error('FINANZAS_MAX_PROFILE_BYTES debe ser un entero entre 2 MiB y 64 MiB.')
}

function isLocalDevelopmentHost(hostname) {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function isPrivateLanHost(hostname) {
  const octets = hostname.split('.').map((value) => Number(value))
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [first, second] = octets
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (configuredOrigins.has(origin)) return true

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:') return false
    const hostname = url.hostname.toLowerCase()
    return isLocalDevelopmentHost(hostname) || (lanMode && isPrivateLanHost(hostname))
  } catch {
    return false
  }
}

function send(res, status, body, origin, extraHeaders = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,if-match,if-none-match,x-finanzas-operation',
    'access-control-expose-headers': 'etag',
    ...extraHeaders,
  }
  if (origin && isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

async function readJson(req, limit = maxJsonBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('payload_too_large')
      error.code = 'PAYLOAD_TOO_LARGE'
      error.maxBytes = limit
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function isAllowedRequest(req) {
  return isAllowedOrigin(req.headers.origin)
}

function listProfiles() {
  return database
    .prepare('SELECT data_json FROM profiles ORDER BY updated_at DESC')
    .all()
    .flatMap((row) => {
      try {
        const parsed = financialProfileSchema.safeParse(migrateProfile(rowToProfile(row)))
        if (!parsed.success) {
          console.warn('Perfil almacenado omitido por no cumplir el esquema financiero.')
          return []
        }
        return [parsed.data]
      } catch {
        console.warn('Perfil almacenado omitido por JSON invalido.')
        return []
      }
    })
}

function listProfileRevisions() {
  return Object.fromEntries(database.prepare('SELECT id, revision FROM profiles').all().map((row) => [row.id, Number(row.revision)]))
}

function profileCollectionEtag(revisions = listProfileRevisions()) {
  const mutationCount = Number(database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'profile'").get()?.count ?? 0)
  return `"profiles-${sha256(JSON.stringify({ mutationCount, revisions: Object.entries(revisions).sort(([left], [right]) => left.localeCompare(right)) }))}"`
}

function listProfileImportUndos() {
  return Object.fromEntries(
    database.prepare('SELECT profile_id, batch_id, applied_revision, created_at FROM profile_import_undo').all()
      .map((row) => [row.profile_id, { batchId: row.batch_id, revision: Number(row.applied_revision), createdAt: row.created_at }]),
  )
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function requestError(status, code, message, details = {}) {
  const error = new Error(message)
  error.status = status
  error.code = code
  Object.assign(error, details)
  return error
}

function parseProfileRevision(value) {
  if (typeof value !== 'string') return undefined
  const match = value.match(/^"profile-(\d+)"$/)
  if (!match) return undefined
  const revision = Number(match[1])
  return Number.isSafeInteger(revision) && revision > 0 ? revision : undefined
}

function profileEtag(revision) {
  return `"profile-${revision}"`
}

function upsertProfile(profile, ifMatch, ifNoneMatch, operation) {
  const validatedProfile = financialProfileSchema.parse(migrateProfile(profile))
  const dataJson = JSON.stringify(validatedProfile)
  if (Buffer.byteLength(dataJson) > maxProfileJsonBytes) {
    throw requestError(413, 'PROFILE_TOO_LARGE', 'El perfil excede el limite de persistencia local.', { maxBytes: maxProfileJsonBytes })
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    const existing = database.prepare('SELECT revision, data_json FROM profiles WHERE id = ?').get(validatedProfile.id)
    let revision

    if (existing) {
      if (ifNoneMatch === '*') {
        throw requestError(409, 'PROFILE_CONFLICT', 'Ese perfil ya existe. Recarga antes de continuar.', {
          currentRevision: Number(existing.revision),
        })
      }
      const expectedRevision = parseProfileRevision(ifMatch)
      if (!expectedRevision) {
        throw requestError(428, 'PROFILE_PRECONDITION_REQUIRED', 'Recarga el perfil antes de guardar cambios.', {
          currentRevision: Number(existing.revision),
        })
      }
      if (expectedRevision !== Number(existing.revision)) {
        throw requestError(409, 'PROFILE_CONFLICT', 'Otra pestana modifico este perfil. Recarga y vuelve a aplicar tus cambios.', {
          currentRevision: Number(existing.revision),
        })
      }
      const result = database
        .prepare(
          `UPDATE profiles
           SET name = ?, data_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND revision = ?`,
        )
        .run(validatedProfile.name, dataJson, validatedProfile.id, expectedRevision)
      if (result.changes !== 1) {
        throw requestError(409, 'PROFILE_CONFLICT', 'Otra pestana modifico este perfil. Recarga y vuelve a aplicar tus cambios.', {
          currentRevision: Number(existing.revision),
        })
      }
      revision = expectedRevision + 1
    } else {
      if (typeof ifMatch === 'string') {
        throw requestError(409, 'PROFILE_CONFLICT', 'El perfil ya no existe. Recarga antes de volver a guardarlo.')
      }
      if (ifNoneMatch !== '*') {
        throw requestError(428, 'PROFILE_PRECONDITION_REQUIRED', 'La creacion del perfil requiere una precondicion explicita.')
      }
      database.prepare('INSERT INTO profiles (id, name, data_json, revision) VALUES (?, ?, ?, 1)').run(validatedProfile.id, validatedProfile.name, dataJson)
      revision = 1
    }
    if (operation === 'import_batch') {
      database.prepare(`
        INSERT INTO profile_import_undo (profile_id, batch_id, previous_data_json, previous_sha256, applied_revision)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET
          batch_id = excluded.batch_id,
          previous_data_json = excluded.previous_data_json,
          previous_sha256 = excluded.previous_sha256,
          applied_revision = excluded.applied_revision,
          created_at = CURRENT_TIMESTAMP
      `).run(validatedProfile.id, randomUUID(), existing?.data_json ?? null, existing?.data_json ? sha256(existing.data_json) : null, revision)
    } else {
      database.prepare('DELETE FROM profile_import_undo WHERE profile_id = ?').run(validatedProfile.id)
    }
    syncProfileDocuments(validatedProfile)
    writeAudit('profile', validatedProfile.id, 'upsert', {
      name: validatedProfile.name,
      documentCount: validatedProfile.importedDocuments.length,
      revision,
      operation: operation ?? 'profile_write',
    })
    database.exec('COMMIT')
    return { profile: validatedProfile, revision }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function rollbackLatestImport(profileId, ifMatch) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const current = database.prepare('SELECT revision FROM profiles WHERE id = ?').get(profileId)
    if (!current) throw requestError(404, 'PROFILE_NOT_FOUND', 'Perfil no encontrado.')
    const expectedRevision = parseProfileRevision(ifMatch)
    if (!expectedRevision) throw requestError(428, 'PROFILE_PRECONDITION_REQUIRED', 'Recarga el perfil antes de deshacer la importacion.')
    const undo = database.prepare('SELECT * FROM profile_import_undo WHERE profile_id = ?').get(profileId)
    if (!undo) throw requestError(409, 'IMPORT_UNDO_UNAVAILABLE', 'Ya no hay una importacion reciente que se pueda deshacer.')
    if (expectedRevision !== Number(current.revision) || expectedRevision !== Number(undo.applied_revision)) {
      throw requestError(409, 'PROFILE_CONFLICT', 'El perfil cambio despues de la importacion. Recarga antes de continuar.', {
        currentRevision: Number(current.revision),
      })
    }

    if (undo.previous_data_json === null) {
      database.prepare('DELETE FROM profiles WHERE id = ? AND revision = ?').run(profileId, expectedRevision)
      writeAudit('profile', profileId, 'undo_import_delete', { batchId: undo.batch_id })
      database.exec('COMMIT')
      return { deleted: true }
    }

    if (sha256(undo.previous_data_json) !== undo.previous_sha256) throw new Error('El snapshot de deshacer no supera la verificacion de integridad.')
    const restoredProfile = financialProfileSchema.parse(migrateProfile(JSON.parse(undo.previous_data_json)))
    const revision = expectedRevision + 1
    const result = database.prepare(`
      UPDATE profiles
      SET name = ?, data_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND revision = ?
    `).run(restoredProfile.name, JSON.stringify(restoredProfile), revision, profileId, expectedRevision)
    if (result.changes !== 1) throw requestError(409, 'PROFILE_CONFLICT', 'El perfil cambio mientras se deshacia la importacion.')
    syncProfileDocuments(restoredProfile)
    database.prepare('DELETE FROM profile_import_undo WHERE profile_id = ?').run(profileId)
    writeAudit('profile', profileId, 'undo_import', { batchId: undo.batch_id, revision })
    database.exec('COMMIT')
    return { deleted: false, profile: restoredProfile, revision }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function deleteAllProfiles(ifMatch) {
  if (typeof ifMatch !== 'string') {
    throw requestError(428, 'PROFILE_PRECONDITION_REQUIRED', 'Recarga los perfiles antes de eliminarlos.')
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    if (ifMatch !== profileCollectionEtag()) {
      throw requestError(409, 'PROFILE_COLLECTION_CONFLICT', 'Otra pestana modifico los perfiles. Recarga antes de eliminarlos.')
    }
    const deletedCount = Number(database.prepare('DELETE FROM profiles').run().changes)
    writeAudit('profile', 'all', 'delete_all', { deletedCount })
    database.exec('COMMIT')
    return deletedCount
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean)
}

function termMatches(normalizedText, textTokens, term) {
  const normalizedTerm = normalizeText(term)
  if (!normalizedTerm) return false
  const termTokens = normalizedTerm.split(/\s+/).filter(Boolean)
  if (termTokens.length === 1 && normalizedTerm.length <= 3) return textTokens.has(normalizedTerm)
  if (termTokens.length > 1) return termTokens.every((token) => textTokens.has(token)) || normalizedText.includes(normalizedTerm)
  return textTokens.has(normalizedTerm) || normalizedText.includes(normalizedTerm)
}

function patternMatches(pattern, text) {
  try {
    return new RegExp(pattern, 'i').test(text)
  } catch {
    return false
  }
}

function sourceMap() {
  return new Map(
    database
      .prepare('SELECT id, name, url, publisher, retrieved_at FROM knowledge_sources ORDER BY publisher, name')
      .all()
      .map((source) => [
        source.id,
        {
          id: source.id,
          name: source.name,
          url: source.url,
          publisher: source.publisher,
          retrievedAt: source.retrieved_at,
        },
      ]),
  )
}

function enrichKnowledgeEntries(entries) {
  const sources = sourceMap()
  return entries.map((entry) => ({
    ...entry,
    sources: entry.sourceIds.map((id) => sources.get(id)).filter(Boolean),
  }))
}

function listKnowledge(query = '', domain = '') {
  const rows = database
    .prepare('SELECT * FROM knowledge_entries ORDER BY domain, title')
    .all()
    .map(rowToKnowledge)
  const normalizedQuery = normalizeText(query)
  const queryTokens = tokenize(query)
  const normalizedDomain = normalizeText(domain)

  return enrichKnowledgeEntries(
    rows.filter((entry) => {
      const matchesDomain = !normalizedDomain || normalizeText(entry.domain) === normalizedDomain
      const haystack = [entry.domain, entry.title, entry.summary, ...entry.aliases, ...entry.patterns, ...entry.fields, ...entry.sourceIds].join(' ')
      const normalizedHaystack = normalizeText(haystack)
      const haystackTokens = new Set(tokenize(haystack))
      const matchesQuery =
        !normalizedQuery ||
        (normalizedQuery.length > 3 && normalizedHaystack.includes(normalizedQuery)) ||
        queryTokens.every((token) => termMatches(normalizedHaystack, haystackTokens, token))
      return matchesDomain && matchesQuery
    }),
  )
}

function explainText(text) {
  const normalized = normalizeText(text)
  const textTokens = new Set(tokenize(text))
  return listKnowledge().filter((entry) => {
    const aliasesMatch = [entry.title, ...entry.aliases, ...entry.fields].some((term) => termMatches(normalized, textTokens, term))
    const patternsMatch = entry.patterns.some((pattern) => patternMatches(pattern, text) || patternMatches(pattern, normalized))
    return aliasesMatch || patternsMatch
  })
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin)
  if (!isAllowedRequest(req)) return send(res, 403, { error: 'Origen no permitido para la API local.' }, origin)

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, dbFile: basename(dbPath), mode: lanMode ? 'sqlite-local-lan' : 'sqlite-local-file', writable: true, authRequired: true, maxProfileBytes: maxProfileJsonBytes }, origin)
    }

  if (!isAuthenticated(req)) return send(res, 401, { error: 'Introduce la clave de acceso de la API para abrir tus datos.' }, origin)

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      const revisions = listProfileRevisions()
      const collectionEtag = profileCollectionEtag(revisions)
      return send(res, 200, { profiles: listProfiles(), revisions, importUndos: listProfileImportUndos(), collectionEtag }, origin, { etag: collectionEtag })
  }

  const profileDocumentsMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/documents$/)
  if (req.method === 'GET' && profileDocumentsMatch) {
    const profileId = decodeURIComponent(profileDocumentsMatch[1])
    const exists = database.prepare('SELECT 1 FROM profiles WHERE id = ?').get(profileId)
    if (!exists) return send(res, 404, { error: 'Perfil no encontrado.' }, origin)
    return send(res, 200, { documents: listProfileDocuments(profileId) }, origin)
  }

  const profileReconciliationMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/reconciliation$/)
  if (req.method === 'GET' && profileReconciliationMatch) {
    const profileId = decodeURIComponent(profileReconciliationMatch[1])
    const exists = database.prepare('SELECT 1 FROM profiles WHERE id = ?').get(profileId)
    if (!exists) return send(res, 404, { error: 'Perfil no encontrado.' }, origin)
    return send(res, 200, { matches: listProfileReconciliation(profileId) }, origin)
  }

  const profileTransactionAmountsMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/transaction-amounts$/)
  if (req.method === 'GET' && profileTransactionAmountsMatch) {
    const profileId = decodeURIComponent(profileTransactionAmountsMatch[1])
    const exists = database.prepare('SELECT 1 FROM profiles WHERE id = ?').get(profileId)
    if (!exists) return send(res, 404, { error: 'Perfil no encontrado.' }, origin)
    return send(res, 200, { amounts: listProfileTransactionAmounts(profileId) }, origin)
  }

    if (req.method === 'PUT' && url.pathname.startsWith('/api/profiles/')) {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'Content-Type debe ser application/json.' }, origin)
      const profile = await readJson(req, maxProfileJsonBytes)
      const profileId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
      if (!profile?.id || !profile?.name || profile.id !== profileId) return send(res, 400, { error: 'Perfil invalido.' }, origin)
      const operation = req.headers['x-finanzas-operation'] === 'import_batch' ? 'import_batch' : undefined
      const saved = upsertProfile(profile, req.headers['if-match'], req.headers['if-none-match'], operation)
      return send(res, 200, { ...saved, collectionEtag: profileCollectionEtag() }, origin, { etag: profileEtag(saved.revision) })
    }

    const importUndoMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/import-undo$/)
    if (req.method === 'POST' && importUndoMatch) {
      const profileId = decodeURIComponent(importUndoMatch[1])
      const result = rollbackLatestImport(profileId, req.headers['if-match'])
      return send(res, 200, { ...result, collectionEtag: profileCollectionEtag() }, origin, result.revision ? { etag: profileEtag(result.revision) } : {})
    }

    if (req.method === 'DELETE' && url.pathname === '/api/profiles') {
      const deletedCount = deleteAllProfiles(req.headers['if-match'])
      return send(res, 200, { ok: true, deletedCount }, origin)
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/profiles/')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
      const existing = database.prepare('SELECT revision FROM profiles WHERE id = ?').get(id)
      if (!existing) return send(res, 404, { error: 'Perfil no encontrado.' }, origin)
      const expectedRevision = parseProfileRevision(req.headers['if-match'])
      if (!expectedRevision) return send(res, 428, { error: 'Recarga el perfil antes de eliminarlo.', code: 'PROFILE_PRECONDITION_REQUIRED' }, origin)
      if (expectedRevision !== Number(existing.revision)) {
        return send(res, 409, { error: 'Otra pestana modifico este perfil. Recarga antes de eliminarlo.', code: 'PROFILE_CONFLICT', currentRevision: Number(existing.revision) }, origin)
      }
      const result = database.prepare('DELETE FROM profiles WHERE id = ? AND revision = ?').run(id, expectedRevision)
      if (result.changes === 0) return send(res, 409, { error: 'Otra pestana modifico este perfil. Recarga antes de eliminarlo.', code: 'PROFILE_CONFLICT' }, origin)
      writeAudit('profile', id, 'delete', {})
      return send(res, 200, { ok: true, collectionEtag: profileCollectionEtag() }, origin)
    }

    if (req.method === 'GET' && url.pathname === '/api/knowledge') {
      return send(
        res,
        200,
        {
          entries: listKnowledge(url.searchParams.get('q') ?? '', url.searchParams.get('domain') ?? ''),
        },
        origin,
      )
    }

    if (req.method === 'POST' && url.pathname === '/api/knowledge/explain') {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'Content-Type debe ser application/json.' }, origin)
      const body = knowledgeExplainRequestSchema.parse(await readJson(req))
      return send(res, 200, { matches: explainText(body.text) }, origin)
    }

    return send(res, 404, { error: 'Ruta no encontrada.' }, origin)
  } catch (error) {
    if (error?.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'El cuerpo excede el limite permitido.', code: error.code, maxBytes: error.maxBytes }, origin)
    if (error?.status) return send(res, error.status, { error: error.message, code: error.code, currentRevision: error.currentRevision, maxBytes: error.maxBytes }, origin)
    if (error instanceof SyntaxError) return send(res, 400, { error: 'JSON invalido.' }, origin)
    if (error?.name === 'ZodError') {
      const errorMessage = url.pathname === '/api/knowledge/explain' ? 'Solicitud de explicacion invalida.' : url.pathname.startsWith('/api/profiles') ? 'Perfil invalido.' : 'Solicitud invalida.'
      return send(res, 400, { error: errorMessage }, origin)
    }
    const errorId = randomUUID()
    console.error(`API error ${errorId}`, error)
    return send(res, 500, { error: `Error interno. Referencia: ${errorId}` }, origin)
  }
})

server.listen(port, lanMode ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Finanzas OS API on http://127.0.0.1:${port}`)
  console.log(`SQLite file: ${dbPath}`)
  if (!process.env.FINANZAS_API_TOKEN) console.log(`Clave de acceso para esta sesion: ${accessToken}`)
})
