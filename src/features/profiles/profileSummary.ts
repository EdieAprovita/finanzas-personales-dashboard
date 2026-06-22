import { exampleProfiles } from '../../domain/exampleData'
import type { DocumentKind, FinancialProfile, ImportedDocument } from '../../domain/types'

const documentKindLabels: Record<DocumentKind, string> = {
  credit_card_statement: 'Estado de tarjeta',
  payroll_cfdi: 'Nomina',
  bank_statement: 'Estado bancario',
  investment_statement: 'Inversiones',
  invoice_cfdi: 'Factura CFDI',
  purchase_receipt: 'Ticket o recibo',
  unknown: 'Por clasificar',
}

function documentKindLabel(kind: ImportedDocument['kind']) {
  return documentKindLabels[kind ?? 'unknown']
}

export function profileFacts(profile: FinancialProfile) {
  const latestMonth = profile.monthlySnapshots.at(-1)?.month ?? 'Sin mes'
  const processedDocs = profile.importedDocuments.filter((doc) => doc.status === 'processed').length
  const reviewDocs = profile.importedDocuments.filter((doc) => doc.status === 'needs_review').length
  const isExample = exampleProfiles.some((example) => example.id === profile.id)
  const isEmpty =
    profile.accounts.length === 0 &&
    profile.transactions.length === 0 &&
    profile.importedDocuments.length === 0 &&
    profile.goals.length === 0
  const sourceLabel = profile.importedDocuments.length > 0 ? 'Importado' : isEmpty ? 'Vacio' : isExample ? 'Ejemplo' : 'Manual'
  const docKindCounts = profile.importedDocuments.reduce<Record<string, number>>((counts, doc) => {
    const label = documentKindLabel(doc.kind)
    counts[label] = (counts[label] ?? 0) + 1
    return counts
  }, {})
  return {
    latestMonth,
    accounts: profile.accounts.length,
    transactions: profile.transactions.length,
    documents: profile.importedDocuments.length,
    goals: profile.goals.length,
    processedDocs,
    reviewDocs,
    hasImports: profile.importedDocuments.length > 0,
    isExample,
    isEmpty,
    sourceLabel,
    docKindCounts,
  }
}

export function profileDisplayName(profile: FinancialProfile, profiles: FinancialProfile[]) {
  const duplicatedName = profiles.filter((row) => row.name === profile.name).length > 1
  if (!duplicatedName) return profile.name
  if (profile.id.startsWith('import-')) return `${profile.name} ${profile.id.replace('import-', '')}`
  if (profile.id.startsWith('personal-')) return `${profile.name} #${profile.id.replace('personal-', '')}`
  return `${profile.name} (${profile.id})`
}

export function profileOptionLabel(profile: FinancialProfile, profiles: FinancialProfile[]) {
  const facts = profileFacts(profile)
  return `${profileDisplayName(profile, profiles)} · ${facts.sourceLabel.toLowerCase()} · ${facts.accounts} cuenta(s) · ${facts.transactions} mov.`
}

export function enrichImportedProfileName(profile: FinancialProfile, documents: ImportedDocument[]) {
  if (!documents.length || !profile.id.startsWith('import-')) return profile
  const kindLabels = [...new Set(documents.map((doc) => documentKindLabel(doc.kind)))]
  const institutions = [
    ...new Set(
      documents
        .filter((doc) => ['credit_card_statement', 'bank_statement', 'investment_statement'].includes(doc.kind ?? 'unknown'))
        .map((doc) => doc.detectedInstitution)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const suffix = profile.id.replace('import-', '')
  const primaryLabel = kindLabels.slice(0, 2).join(' + ') || 'documentos'
  return {
    ...profile,
    name: `Perfil ${primaryLabel} ${suffix}`,
    description: `Creado desde ${documents.length} documento(s): ${kindLabels.join(', ')}.${
      institutions.length ? ` Instituciones detectadas: ${institutions.slice(0, 2).join(', ')}.` : ''
    }`,
  }
}
