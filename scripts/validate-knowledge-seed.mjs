import { knowledgeEntries, knowledgeSources } from '../server/knowledge-seed.mjs'

const sourceIds = new Set(knowledgeSources.map((source) => source.id))
const failures = []

for (const entry of knowledgeEntries) {
  if (!entry.id || !entry.domain || !entry.title) failures.push(`${entry.id || 'unknown'}: metadatos incompletos`)
  if (!Array.isArray(entry.fields) || entry.fields.length === 0) failures.push(`${entry.id}: sin campos`)
  for (const field of entry.fields ?? []) {
    if (typeof field !== 'string' || !field.trim()) failures.push(`${entry.id}: campo vacio`)
    if (/_/.test(field)) failures.push(`${entry.id}: campo no normalizado ${field}`)
  }
  for (const sourceId of entry.sourceIds ?? []) {
    if (!sourceIds.has(sourceId)) failures.push(`${entry.id}: fuente inexistente ${sourceId}`)
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, entries: knowledgeEntries.length, sources: knowledgeSources.length }, null, 2))
