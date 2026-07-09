import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { database, dbPath, rowToKnowledge, rowToProfile, writeAudit } from './db.mjs'
import { financialProfileSchema, knowledgeExplainRequestSchema, migrateProfile } from './profile-schema.mjs'

const port = Number(process.env.FINANZAS_API_PORT ?? 4147)
const lanMode = process.env.FINANZAS_LAN_MODE === '1'
const configuredOrigins = new Set(
  (process.env.FINANZAS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const maxJsonBytes = 2 * 1024 * 1024

function isLocalDevelopmentHost(hostname) {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function isAllowedOrigin(origin) {
  if (!origin) return !lanMode
  if (configuredOrigins.has(origin)) return true

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:') return false
    const hostname = url.hostname.toLowerCase()
    return isLocalDevelopmentHost(hostname) && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
  } catch {
    return false
  }
}

function send(res, status, body, origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
  }
  if (origin && isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxJsonBytes) {
      const error = new Error('payload_too_large')
      error.code = 'PAYLOAD_TOO_LARGE'
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
    .map(rowToProfile)
    .map(migrateProfile)
}

function upsertProfile(profile) {
  const validatedProfile = financialProfileSchema.parse(migrateProfile(profile))
  database
    .prepare(
      `INSERT INTO profiles (id, name, data_json)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         data_json = excluded.data_json,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(validatedProfile.id, validatedProfile.name, JSON.stringify(validatedProfile))
  writeAudit('profile', validatedProfile.id, 'upsert', { name: validatedProfile.name })
  return validatedProfile
}

function deleteAllProfiles() {
  const row = database.prepare('SELECT COUNT(*) AS count FROM profiles').get()
  const deletedCount = Number(row?.count ?? 0)
  database.exec('BEGIN')
  try {
    database.prepare('DELETE FROM profiles').run()
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
      return send(res, 200, { ok: true, dbFile: basename(dbPath), mode: lanMode ? 'sqlite-local-lan' : 'sqlite-local-file', writable: true }, origin)
    }

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      return send(res, 200, { profiles: listProfiles() }, origin)
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/api/profiles/')) {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'Content-Type debe ser application/json.' }, origin)
      const profile = await readJson(req)
      const profileId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
      if (!profile?.id || !profile?.name || profile.id !== profileId) return send(res, 400, { error: 'Perfil invalido.' }, origin)
      const savedProfile = upsertProfile(profile)
      return send(res, 200, { profile: savedProfile }, origin)
    }

    if (req.method === 'DELETE' && url.pathname === '/api/profiles') {
      const deletedCount = deleteAllProfiles()
      return send(res, 200, { ok: true, deletedCount }, origin)
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/profiles/')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
      database.prepare('DELETE FROM profiles WHERE id = ?').run(id)
      writeAudit('profile', id, 'delete', {})
      return send(res, 200, { ok: true }, origin)
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
    if (error?.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'El cuerpo excede el limite permitido.' }, origin)
    if (error instanceof SyntaxError) return send(res, 400, { error: 'JSON invalido.' }, origin)
    if (error?.name === 'ZodError') return send(res, 400, { error: 'Perfil invalido.' }, origin)
    const errorId = randomUUID()
    console.error(`API error ${errorId}`, error)
    return send(res, 500, { error: `Error interno. Referencia: ${errorId}` }, origin)
  }
})

server.listen(port, lanMode ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Finanzas OS API on http://127.0.0.1:${port}`)
  console.log(`SQLite file: ${dbPath}`)
})
