import { useEffect, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { explainText, getKnowledge, type KnowledgeEntry } from '../../lib/api'

type KnowledgeSection = {
  key: string
  label: string
  domains?: string[]
  terms?: string[]
}

const knowledgeSections: KnowledgeSection[] = [
  { key: 'all', label: 'Todo' },
  { key: 'payroll', label: 'Nomina', domains: ['payroll_mx', 'bank_statement_mx'], terms: ['nomina', 'sueldo', 'cfdi'] },
  { key: 'cards', label: 'Tarjetas', domains: ['credit_card_mx', 'credit_card_statement_mx'] },
  { key: 'banking', label: 'Bancos / SPEI', domains: ['bank_statement_mx', 'bank_transfer_mx'], terms: ['spei', 'cep', 'clave de rastreo'] },
  { key: 'nu', label: 'Nu / SOFIPO', domains: ['savings_account_mx', 'credit_card_mx', 'bank_statement_mx'], terms: ['nu', 'cajita', 'gat', 'sofipo'] },
  { key: 'gbm', label: 'GBM', domains: ['investment_statement_mx', 'retirement_investment_mx'], terms: ['gbm', 'smart cash', 'trading'] },
  { key: 'cetes', label: 'Cetes', domains: ['investment_statement_mx'], terms: ['cetes', 'cetesdirecto', 'bonddia', 'enerfin'] },
  { key: 'retirement', label: 'Retiro', domains: ['retirement_savings_mx', 'retirement_investment_mx'], terms: ['afore', 'ppr', 'siefore', 'retiro'] },
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function entryText(entry: KnowledgeEntry) {
  return normalize([entry.domain, entry.title, entry.summary, ...entry.aliases, ...entry.fields, ...entry.sourceIds].join(' '))
}

function entryMatchesSection(entry: KnowledgeEntry, section: KnowledgeSection) {
  if (section.key === 'all') return true
  if (section.key === 'payroll' && (entry.id.includes('payroll') || entry.id.includes('nomina'))) return true
  if (section.key === 'cards' && entry.id.includes('card') && !entry.id.includes('nu-')) return true
  if (section.key === 'banking' && (entry.id.includes('spei') || entry.domain === 'bank_transfer_mx')) return true
  if (section.key === 'nu' && entry.id.includes('nu-')) return true
  if (section.key === 'gbm' && (entry.id.includes('gbm') || entry.id.includes('bmv') || entry.id.includes('investment-fund'))) return true
  if (section.key === 'cetes' && entry.id.includes('cetesdirecto')) return true
  if (section.key === 'retirement' && (entry.id.includes('ppr') || entry.id.includes('afore') || entry.domain.includes('retirement'))) return true
  const domainMatch = section.domains?.includes(entry.domain) ?? false
  const haystack = entryText(entry)
  const termMatch = section.terms?.some((term) => haystack.includes(normalize(term))) ?? false
  return domainMatch && (!section.terms?.length || termMatch)
}

function filterEntries(entries: KnowledgeEntry[], sectionKey: string, query: string) {
  const section = knowledgeSections.find((item) => item.key === sectionKey) ?? knowledgeSections[0]
  if (!section) return entries
  const queryTokens = normalize(query).split(/\s+/).filter(Boolean)
  return entries.filter((entry) => {
    const haystack = entryText(entry)
    return entryMatchesSection(entry, section) && queryTokens.every((token) => haystack.includes(token))
  })
}

export function KnowledgeMatrix() {
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [allEntries, setAllEntries] = useState<KnowledgeEntry[]>([])
  const [activeSection, setActiveSection] = useState('all')
  const [matches, setMatches] = useState<KnowledgeEntry[]>([])
  const [status, setStatus] = useState('Cargando matriz local...')
  const entries = filterEntries(allEntries, activeSection, query)
  const sourceCount = new Set(allEntries.flatMap((entry) => entry.sourceIds)).size
  const publisherCount = new Set(allEntries.flatMap((entry) => entry.sources?.map((source) => source.publisher) ?? [])).size

  useEffect(() => {
    let active = true
    getKnowledge()
      .then((rows) => {
        if (!active) return
        setAllEntries(rows)
        setStatus(`${rows.length} conceptos y ${new Set(rows.flatMap((entry) => entry.sourceIds)).size} fuentes oficiales cargadas.`)
      })
      .catch((error) => {
        if (!active) return
        setStatus(error instanceof Error ? error.message : 'No se pudo cargar la matriz local.')
      })
    return () => {
      active = false
    }
  }, [])

  function runSearch(nextQuery = query, nextSection = activeSection) {
    setQuery(nextQuery)
    setActiveSection(nextSection)
    const filtered = filterEntries(allEntries, nextSection, nextQuery)
    setStatus(`${filtered.length} resultado(s) en ${knowledgeSections.find((item) => item.key === nextSection)?.label ?? 'matriz local'}.`)
  }

  async function runExplain() {
    try {
      const rows = await explainText(text)
      setMatches(rows)
      setStatus(`${rows.length} concepto(s) detectados en el texto.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo explicar el texto.')
    }
  }

  return (
    <div className="knowledge-grid">
      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Matriz de conocimiento Mexico</h2>
            <p>Identificadores locales para explicar cargos de tarjeta, nomina, impuestos y transferencias.</p>
          </div>
          <BookOpen size={24} />
        </div>

        <div className="knowledge-search">
          <div className="knowledge-section-tabs" aria-label="Secciones de matriz financiera">
            {knowledgeSections.map((section) => {
              const count = filterEntries(allEntries, section.key, '').length
              return (
                <button
                  type="button"
                  key={section.key}
                  className={activeSection === section.key ? 'active' : ''}
                  onClick={() => runSearch(query, section.key)}
                  data-testid="knowledge-section-tab"
                  data-section-key={section.key}
                >
                  {section.label}
                  <span>{count}</span>
                </button>
              )
            })}
          </div>
          <div className="knowledge-source-summary" aria-label="Cobertura de fuentes oficiales">
            <article>
              <strong>{allEntries.length}</strong>
              <span>conceptos</span>
            </article>
            <article>
              <strong>{sourceCount}</strong>
              <span>fuentes</span>
            </article>
            <article>
              <strong>{publisherCount || '--'}</strong>
              <span>emisores</span>
            </article>
          </div>
          <label>
            Buscar concepto
            <div className="inline-search">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ISR, MSI, CAT, SPEI, IMSS..." />
              <button type="button" className="action-button" onClick={() => runSearch()}>
                <Search size={18} /> Buscar
              </button>
            </div>
          </label>
          <label>
            Explicar texto de cargo / recibo
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Pega aqui una descripcion: PAGO MINIMO, MSI 03/12, ISR RETENIDO, CLAVE DE RASTREO..."
            />
          </label>
          <button type="button" className="action-button" onClick={() => void runExplain()}>
            <Search size={18} /> Detectar conceptos
          </button>
        </div>
        <p className="import-message">{status}</p>
      </section>

      {matches.length > 0 && (
        <section className="panel wide">
          <div className="panel-heading">
            <div>
              <h2>Conceptos detectados</h2>
              <p>Resultado de comparar tu texto contra aliases, patrones y campos de la matriz local.</p>
            </div>
          </div>
          <KnowledgeList entries={matches} />
        </section>
      )}

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Diccionario operativo</h2>
            <p>Semilla inicial ampliada con patrones por banco, tarjeta, nomina, ahorro e inversion.</p>
          </div>
        </div>
        <KnowledgeList entries={entries} />
      </section>
    </div>
  )
}

function KnowledgeList({ entries }: { entries: KnowledgeEntry[] }) {
  if (!entries.length) return <p className="empty">No hay conceptos para mostrar.</p>

  return (
    <div className="knowledge-list">
      {entries.map((entry) => (
        <article key={entry.id}>
          <div>
            <span>{formatDomain(entry.domain)}</span>
            <h3>{entry.title}</h3>
            <p>{entry.summary}</p>
            <small>Aliases: {entry.aliases.slice(0, 5).map(formatAlias).join(', ')}</small>
            <details className="knowledge-fields">
              <summary>Campos: {entry.fields.length} campo(s)</summary>
              <small>{entry.fields.join(', ')}</small>
            </details>
            {entry.sources?.length ? (
              <small className="knowledge-sources">
                Fuentes:{' '}
                {entry.sources.slice(0, 4).map((source, index) => (
                  <span key={source.id}>
                    {index > 0 ? ', ' : ''}
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                    </a>
                    {' '}
                    ({source.publisher} · {source.retrievedAt})
                  </span>
                ))}
              </small>
            ) : (
              <small>Fuentes: {entry.sourceIds.slice(0, 4).join(', ')}</small>
            )}
          </div>
          <strong>{Math.round(entry.confidence * 100)}%</strong>
        </article>
      ))}
    </div>
  )
}

function formatDomain(domain: string) {
  return domain
    .split('_')
    .filter(Boolean)
    .map((part) => (part.toLowerCase() === 'mx' ? 'MX' : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ')
}

function formatAlias(alias: string) {
  return alias.replace(/_/g, ' ')
}
