import type { FinancialProfile } from '../domain/types'

const API_BASE = import.meta.env.VITE_FINANZAS_API_URL ?? ''

export interface KnowledgeEntry {
  id: string
  domain: string
  title: string
  aliases: string[]
  summary: string
  patterns: string[]
  fields: string[]
  sourceIds: string[]
  sources?: KnowledgeSource[]
  confidence: number
}

export interface KnowledgeSource {
  id: string
  name: string
  url: string
  publisher: string
  retrievedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `API local respondio ${response.status}`)
  }
  return (await response.json()) as T
}

export async function getApiHealth() {
  return request<{ ok: boolean; dbFile: string; mode: string; writable: boolean }>('/api/health')
}

export async function getProfiles() {
  const body = await request<{ profiles: FinancialProfile[] }>('/api/profiles')
  return body.profiles
}

export async function saveProfile(profile: FinancialProfile) {
  const body = await request<{ profile: FinancialProfile }>(`/api/profiles/${encodeURIComponent(profile.id)}`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
  return body.profile
}

export async function deleteProfile(id: string) {
  return request<{ ok: boolean }>(`/api/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function deleteAllProfiles() {
  return request<{ ok: boolean; deletedCount: number }>('/api/profiles', {
    method: 'DELETE',
  })
}

export async function getKnowledge(query = '', domain = '') {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (domain) params.set('domain', domain)
  const suffix = params.size ? `?${params}` : ''
  const body = await request<{ entries: KnowledgeEntry[] }>(`/api/knowledge${suffix}`)
  return body.entries
}

export async function explainText(text: string) {
  const body = await request<{ matches: KnowledgeEntry[] }>('/api/knowledge/explain', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
  return body.matches
}
