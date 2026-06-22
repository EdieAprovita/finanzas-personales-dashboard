import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  FolderOpen,
  Gauge,
  Landmark,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  WalletCards,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { mxn, type FinancialMetrics } from '../../domain/finance'
import type { FinancialProfile } from '../../domain/types'
import { statusLabel } from '../../domain/status'
import { analyzeDocumentQuality } from '../imports/documentQuality'
import { profileFacts } from '../profiles/profileSummary'

const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4b5563']

interface ChartSize {
  width: number
  height: number
}

function ChartFrame({ className, children }: { className: string; children: (size: ChartSize) => ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 })

  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const measuredElement = element

    function updateSize() {
      setSize({
        width: Math.max(0, Math.floor(measuredElement.clientWidth)),
        height: Math.max(0, Math.floor(measuredElement.clientHeight)),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={className} ref={frameRef}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  )
}

export function Dashboard({
  profile,
  metrics,
  onStartCapture,
  onCreateFromDocuments,
  onOpenPlanning,
}: {
  profile: FinancialProfile
  metrics: FinancialMetrics
  onStartCapture: () => void
  onCreateFromDocuments: () => void
  onOpenPlanning: () => void
}) {
  const facts = profileFacts(profile)
  const documentQuality = analyzeDocumentQuality(profile)

  if (facts.isEmpty) {
    return (
      <div className="dashboard-grid empty-dashboard-grid">
        <section className="panel wide empty-dashboard empty-dashboard-command">
          <div className="empty-dashboard-copy">
            <div className="empty-dashboard-kicker">
              <span>
                <BadgeCheck size={14} /> Perfil activo sin datos
              </span>
              <span>
                <LockKeyhole size={14} /> Workspace local
              </span>
            </div>
            <div>
              <p className="eyebrow">Dashboard de {profile.name}</p>
              <h2>Activa el dashboard financiero de este perfil</h2>
              <p>
                Empieza con una fuente confiable: una cuenta, movimientos, nomina o estados de cuenta. La app mantiene
                cada perfil separado y convierte esos datos en salud financiera, flujo, deuda y metas.
              </p>
            </div>

            <div className="empty-dashboard-summary" aria-label="Estado base del perfil">
              <article>
                <strong>0</strong>
                <span>cuentas</span>
                <small>saldo inicial pendiente</small>
              </article>
              <article>
                <strong>0</strong>
                <span>movimientos</span>
                <small>flujo mensual pendiente</small>
              </article>
              <article>
                <strong>0</strong>
                <span>documentos</span>
                <small>nomina, tarjeta o inversion</small>
              </article>
              <article>
                <strong>0</strong>
                <span>metas</span>
                <small>planeacion pendiente</small>
              </article>
            </div>

            <div className="empty-actions">
              <button type="button" className="action-button" onClick={onStartCapture}>
                <Plus size={18} /> Capturar primer dato <ArrowRight size={17} />
              </button>
              <button type="button" className="ghost" onClick={onCreateFromDocuments}>
                <Upload size={18} /> Importar documentos
              </button>
              <button type="button" className="ghost" onClick={onOpenPlanning}>
                <Target size={18} /> Crear primera meta
              </button>
            </div>
            <div className="empty-dashboard-proof" aria-label="Preparacion del dashboard">
              <span>Perfil independiente</span>
              <span>Sin datos mezclados</span>
              <span>Listo para datos reales</span>
            </div>
          </div>

          <div className="empty-dashboard-visual" aria-label="Vista previa profesional del dashboard sin datos">
            <div className="empty-visual-topline">
              <span>Preview operativo</span>
              <strong>Se desbloquea al cargar fuentes reales</strong>
            </div>
            <div className="empty-visual-score">
              <div>
                <span>Score financiero</span>
                <strong>--/100</strong>
                <small>requiere ingresos, gastos y deuda</small>
              </div>
              <i aria-hidden="true" />
            </div>
            <div className="empty-visual-kpi-row" aria-label="Indicadores de ejemplo bloqueados">
              <article>
                <span>Liquidez</span>
                <strong>-- meses</strong>
              </article>
              <article>
                <span>Deuda</span>
                <strong>--%</strong>
              </article>
              <article>
                <span>Ahorro</span>
                <strong>$--</strong>
              </article>
            </div>
            <div className="empty-visual-table" aria-hidden="true">
              <div>
                <span />
                <i />
              </div>
              <div>
                <span />
                <i />
              </div>
              <div>
                <span />
                <i />
              </div>
            </div>
          </div>
        </section>

        <section className="panel empty-dashboard-readiness">
          <div className="panel-heading">
            <div>
              <h2>Preparacion de datos</h2>
              <p>Lo minimo para convertir el perfil en un diagnostico confiable.</p>
            </div>
            <Gauge size={22} />
          </div>
          <div className="empty-readiness-meter" aria-label="Preparacion 0 por ciento">
            <strong>0%</strong>
            <span>datos base completados</span>
            <i aria-hidden="true" />
          </div>
          <div className="empty-readiness-list">
            <div className="current">
              <Landmark size={18} />
              <span>
                <strong>Cuenta base</strong>
                saldo inicial, banco o cuenta de ahorro
              </span>
              <small>Primer paso</small>
            </div>
            <div>
              <CircleDollarSign size={18} />
              <span>
                <strong>Ingreso y gastos</strong>
                nomina, renta, servicios y pagos recurrentes
              </span>
              <small>Pendiente</small>
            </div>
            <div>
              <FolderOpen size={18} />
              <span>
                <strong>Documentos por tipo</strong>
                tarjetas, estados, recibos e inversiones
              </span>
              <small>Pendiente</small>
            </div>
          </div>
        </section>

        <section className="panel empty-dashboard-path">
          <div className="panel-heading">
            <div>
              <h2>Ruta recomendada</h2>
              <p>El camino mas rapido para tener una lectura financiera accionable.</p>
            </div>
          </div>
          <div className="empty-dashboard-steps">
            <article>
              <Landmark size={18} />
              <div>
                <small>Paso 1</small>
                <strong>Cuenta base</strong>
                <span>Saldo inicial, banco o cuenta de ahorro.</span>
              </div>
            </article>
            <article>
              <WalletCards size={18} />
              <div>
                <small>Paso 2</small>
                <strong>Nomina y gastos</strong>
                <span>Ingreso neto, pagos fijos y compras relevantes.</span>
              </div>
            </article>
            <article>
              <FileText size={18} />
              <div>
                <small>Paso 3</small>
                <strong>Documentos</strong>
                <span>Estados de cuenta, tarjetas, recibos e inversiones.</span>
              </div>
            </article>
            <article>
              <Target size={18} />
              <div>
                <small>Paso 4</small>
                <strong>Meta</strong>
                <span>Viaje, inmueble, auto o reserva.</span>
              </div>
            </article>
          </div>
        </section>

        <section className="panel empty-dashboard-preview">
          <div className="panel-heading">
            <div>
              <h2>Dashboard desbloqueado</h2>
              <p>La app llenara estos modulos solo con datos capturados en este perfil.</p>
            </div>
            <BarChart3 size={22} />
          </div>
          <div className="empty-preview-kpis" aria-label="Indicadores pendientes">
            <article>
              <strong>--/100</strong>
              <span>Salud financiera</span>
            </article>
            <article>
              <strong>$--</strong>
              <span>Flujo mensual</span>
            </article>
            <article>
              <strong>0</strong>
              <span>Metas activas</span>
            </article>
            <article>
              <strong>--%</strong>
              <span>Uso de deuda</span>
            </article>
          </div>
          <div className="empty-preview-chart" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="empty-preview-feed" aria-label="Paneles pendientes">
            <span>
              <ShieldCheck size={15} /> Datos locales por perfil
            </span>
            <span>
              <TrendingUp size={15} /> Tendencias al capturar movimientos
            </span>
            <span>
              <CheckCircle2 size={15} /> Alertas cuando existan documentos
            </span>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className="kpi-grid">
        {metrics.kpis.map((kpi) => (
          <article className={`kpi ${kpi.status}`} key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <p>{kpi.helper}</p>
            <small>{statusLabel(kpi.status)}</small>
          </article>
        ))}
      </section>

      {facts.hasImports && (
        <section className="panel wide import-impact">
          <div className="panel-heading">
            <div>
              <h2>Pulso documental</h2>
              <p>Separacion de fuentes listas y documentos que aun requieren revision antes de alimentar el dashboard.</p>
            </div>
            <Gauge size={24} />
          </div>
          <p className="period-note">
            Cobertura {Math.round(documentQuality.coverageScore * 100)}% · snapshot {facts.latestMonth}. Los PDFs en revision no aplican saldos
            automaticamente.
          </p>
          <div className="document-risk-inline" aria-label="Riesgo documental">
            <AlertTriangle size={18} />
            <span>{documentQuality.risk.headline}</span>
            <small>
              {documentQuality.risk.appliedDocuments} doc. aplicaron movimientos · {documentQuality.risk.pendingReconciliation} por conciliar ·{' '}
              {documentQuality.risk.skippedSemanticDuplicates + documentQuality.risk.skippedDuplicateRows} duplicado(s) omitidos
            </small>
          </div>
          <div className="impact-grid">
            <article>
              <FolderOpen size={20} />
              <strong>{facts.documents}</strong>
              <span>documento(s)</span>
            </article>
            <article>
              <Landmark size={20} />
              <strong>{facts.accounts}</strong>
              <span>cuenta(s)</span>
            </article>
            <article>
              <CircleDollarSign size={20} />
              <strong>{facts.transactions}</strong>
              <span>movimiento(s)</span>
            </article>
            <article>
              <AlertTriangle size={20} />
              <strong>{facts.reviewDocs}</strong>
              <span>por revisar</span>
            </article>
          </div>
          {documentQuality.buckets.length > 0 && (
            <div className="document-pulse-grid">
              {documentQuality.buckets.slice(0, 4).map((bucket) => (
                <article key={bucket.kind}>
                  <span>{bucket.label}</span>
                  <strong>
                    {bucket.processed}/{bucket.total}
                  </strong>
                  <small>
                    {bucket.review > 0 ? `${bucket.review} en revision` : bucket.avgConfidence ? `${Math.round(bucket.avgConfidence * 100)}% confianza` : 'sin score'}
                  </small>
                </article>
              ))}
            </div>
          )}
          <div className="document-pills">
            {profile.importedDocuments.slice(0, 5).map((doc) => (
              <span key={doc.id}>
                {doc.fileType.toUpperCase()} · {doc.kind ?? 'unknown'} · {doc.status}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Flujo, ahorro y patrimonio</h2>
            <p>Resumen mensual actualizado con capturas, importaciones y saldos. Periodo activo: {facts.latestMonth}.</p>
          </div>
          <strong>{mxn(metrics.netWorth)}</strong>
        </div>
        <ChartFrame className="chart-lg">
          {({ width, height }) => (
              <LineChart width={width} height={height} data={profile.monthlySnapshots}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => mxn(Number(value))} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                <Line type="monotone" dataKey="income" stroke="#2563eb" strokeWidth={3.4} dot={false} name="Ingreso" />
                <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={3.4} dot={false} name="Gasto" />
                <Line type="monotone" dataKey="savings" stroke="#059669" strokeWidth={3.4} dot={false} name="Ahorro" />
              </LineChart>
          )}
        </ChartFrame>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Gasto por categoria</h2>
            <p>Contra presupuesto mensual.</p>
          </div>
        </div>
        <ChartFrame className="chart-md">
          {({ width, height }) => (
              <BarChart width={width} height={height} data={metrics.categorySpend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => mxn(Number(value))} />
                <Bar dataKey="amount" name="Gasto" radius={[4, 4, 0, 0]} fill="#2563eb" />
                <Bar dataKey="budget" name="Presupuesto" radius={[4, 4, 0, 0]} fill="#94a3b8" />
              </BarChart>
          )}
        </ChartFrame>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Mix de gasto</h2>
            <p>Lectura rapida del mes actual.</p>
          </div>
        </div>
        <ChartFrame className="chart-md">
          {({ width, height }) => (
              <PieChart width={width} height={height}>
                <Pie
                  data={metrics.categorySpend}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="45%"
                  outerRadius={92}
                  innerRadius={54}
                  paddingAngle={2}
                >
                  {metrics.categorySpend.map((entry, index) => (
                    <Cell key={entry.category} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                <Tooltip formatter={(value) => mxn(Number(value))} />
              </PieChart>
          )}
        </ChartFrame>
      </section>
    </div>
  )
}
