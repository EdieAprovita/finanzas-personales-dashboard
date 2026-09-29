import type { FinancialProfile } from '../domain/types'
import { z } from 'zod'

const API_BASE = import.meta.env.VITE_FINANZAS_API_URL ?? ''
const ACCESS_TOKEN_KEY = 'finanzas-api-access-token'

export class ApiAuthenticationError extends Error {}

export function setApiAccessToken(token: string): void {
  if (token.trim()) window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token.trim())
  else window.sessionStorage.removeItem(ACCESS_TOKEN_KEY)
}


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

async function request<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  const token = window.sessionStorage.getItem(ACCESS_TOKEN_KEY)
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    if (response.status === 401) {
      setApiAccessToken('')
      throw new ApiAuthenticationError('Clave de acceso ausente o incorrecta.')
    }
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `API local respondio ${response.status}`)
  }
  const body = await response.json()
  return schema ? schema.parse(body) : (body as T)
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

export interface PersistedDocumentRecord {
  id: string
  profile_id: string
  fingerprint: string | null
  file_name: string
  file_type: string
  document_kind: string
  document_subtype: string | null
  status: string
  extractor_version: string | null
  source_hash: string | null
  period_start: string | null
  period_end: string | null
  currency: 'MXN' | 'USD' | null
  quality_score: number | null
  source_blob_path: string | null
  source_blob_status: 'available' | 'missing' | 'unreadable'
  field_count: number
  row_count: number
  pending_matches: number
}

export interface PersistedReconciliationMatch {
  id: string
  source_document_id: string
  source_row_id: string | null
  target_transaction_id: string | null
  match_type: string
  amount_diff_minor: number | null
  date_diff_days: number | null
  confidence: number | null
  status: 'matched' | 'partial' | 'unmatched' | 'needs_review'
  file_name: string
  row_index: number | null
  date: string | null
  description: string | null
  amount_minor: number | null
  currency: 'MXN' | 'USD' | null
}

const persistedDocumentRecordSchema = z.object({
  id: z.string(),
  profile_id: z.string(),
  fingerprint: z.string().nullable(),
  file_name: z.string(),
  file_type: z.string(),
  document_kind: z.string(),
  document_subtype: z.string().nullable(),
  status: z.string(),
  extractor_version: z.string().nullable(),
  source_hash: z.string().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  currency: z.enum(['MXN', 'USD']).nullable(),
  quality_score: z.number().nullable(),
  source_blob_path: z.string().nullable(),
  source_blob_status: z.enum(['available', 'missing', 'unreadable']),
  field_count: z.number().int().nonnegative(),
  row_count: z.number().int().nonnegative(),
  pending_matches: z.number().int().nonnegative(),
})

const persistedDocumentsResponseSchema = z.object({
  documents: z.array(persistedDocumentRecordSchema),
})

const persistedReconciliationMatchSchema = z.object({
  id: z.string(),
  source_document_id: z.string(),
  source_row_id: z.string().nullable(),
  target_transaction_id: z.string().nullable(),
  match_type: z.string(),
  amount_diff_minor: z.number().int().nullable(),
  date_diff_days: z.number().int().nullable(),
  confidence: z.number().nullable(),
  status: z.enum(['matched', 'partial', 'unmatched', 'needs_review']),
  file_name: z.string(),
  row_index: z.number().int().nullable(),
  date: z.string().nullable(),
  description: z.string().nullable(),
  amount_minor: z.number().int().nullable(),
  currency: z.enum(['MXN', 'USD']).nullable(),
})

const persistedReconciliationResponseSchema = z.object({
  matches: z.array(persistedReconciliationMatchSchema),
})

const persistedTransactionAmountSchema = z.object({
  transaction_id: z.string(),
  amount_minor: z.number().int(),
  currency: z.enum(['MXN', 'USD']),
  source_document_id: z.string().nullable(),
  updated_at: z.string(),
})

const persistedTransactionAmountsResponseSchema = z.object({
  amounts: z.array(persistedTransactionAmountSchema),
})

export async function getPersistedDocuments(profileId: string): Promise<PersistedDocumentRecord[]> {
  const body = await request(
    `/api/profiles/${encodeURIComponent(profileId)}/documents`,
    undefined,
    persistedDocumentsResponseSchema,
  )
  return body.documents
}

export async function getPersistedReconciliation(profileId: string): Promise<PersistedReconciliationMatch[]> {
  const body = await request(
    `/api/profiles/${encodeURIComponent(profileId)}/reconciliation`,
    undefined,
    persistedReconciliationResponseSchema,
  )
  return body.matches
}

export interface PersistedTransactionAmount {
  transaction_id: string
  amount_minor: number
  currency: 'MXN' | 'USD'
  source_document_id: string | null
  updated_at: string
}

export async function getPersistedTransactionAmounts(profileId: string): Promise<PersistedTransactionAmount[]> {
  const body = await request(
    `/api/profiles/${encodeURIComponent(profileId)}/transaction-amounts`,
    undefined,
    persistedTransactionAmountsResponseSchema,
  )
  return body.amounts
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
