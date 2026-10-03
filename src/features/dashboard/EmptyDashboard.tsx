import {
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

interface EmptyDashboardProps {
  profileName: string
  onStartCapture: () => void
  onCreateFromDocuments: () => void
  onOpenPlanning: () => void
}

export function EmptyDashboard({
  profileName,
  onStartCapture,
  onCreateFromDocuments,
  onOpenPlanning,
}: EmptyDashboardProps) {
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
            <p className="eyebrow">Dashboard de {profileName}</p>
            <h2>Activa el dashboard financiero de este perfil</h2>
            <p>
              Empieza con una fuente confiable: una cuenta, movimientos, nomina o
              estados de cuenta. La app mantiene cada perfil separado y convierte
              esos datos en salud financiera, flujo, deuda y metas.
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
            <span>Información organizada</span>
            <span>Sin datos duplicados</span>
          </div>
        </div>
        <div
          className="empty-dashboard-visual"
          aria-label="Vista previa profesional del dashboard sin datos"
        >
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
            <span>Score Finanzas OS</span>
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
