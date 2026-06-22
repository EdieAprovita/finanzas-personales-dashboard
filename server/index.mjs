import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { database, dbPath, rowToKnowledge, rowToProfile, writeAudit } from './db.mjs'

const port = Number(process.env.FINANZAS_API_PORT ?? 4147)

function localNetworkHosts() {
  return new Set(
    Object.values(networkInterfaces())
      .flatMap((interfaces) => interfaces ?? [])
      .filter((address) => address.family === 'IPv4' && !address.internal)
      .map((address) => address.address),
  )
}

const allowedLocalHosts = localNetworkHosts()

function isLocalDevelopmentHost(hostname) {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || allowedLocalHosts.has(hostname)
}

function isAllowedOrigin(origin) {
  if (!origin) return true
  const configuredOrigins = (process.env.FINANZAS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (configuredOrigins.includes(origin)) return true

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:') return false
    const hostname = url.hostname.toLowerCase()
    return isLocalDevelopmentHost(hostname)
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
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function isAllowedRequest(req) {
  return isAllowedOrigin(req.headers.origin)
}

function listProfiles() {
  return database.prepare('SELECT data_json FROM profiles ORDER BY updated_at DESC').all().map(rowToProfile)
}

function upsertProfile(profile) {
  database
    .prepare(
      `INSERT INTO profiles (id, name, data_json)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         data_json = excluded.data_json,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(profile.id, profile.name, JSON.stringify(profile))
  writeAudit('profile', profile.id, 'upsert', { name: profile.name })
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
      return send(res, 200, { ok: true, dbPath, mode: 'sqlite-local-file' }, origin)
    }

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      return send(res, 200, { profiles: listProfiles() }, origin)
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/api/profiles/')) {
      const profile = await readJson(req)
      if (!profile?.id || !profile?.name) return send(res, 400, { error: 'Perfil invalido.' }, origin)
      upsertProfile(profile)
      return send(res, 200, { profile }, origin)
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
      const body = await readJson(req)
      return send(res, 200, { matches: explainText(String(body?.text ?? '')) }, origin)
    }

    return send(res, 404, { error: 'Ruta no encontrada.' }, origin)
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : 'Error interno.' }, origin)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Finanzas OS API on http://127.0.0.1:${port}`)
  console.log(`SQLite file: ${dbPath}`)
})
