import { ChartNoAxesCombined, CheckCircle2, FolderOpen, Plus, RefreshCw, Target, Trash2, WalletCards } from 'lucide-react'
import type { FinancialProfile } from '../../domain/types'
import { profileDisplayName, profileFacts } from './profileSummary'

type ProfileTargetTab = 'dashboard'

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  pendingDeleteProfileId,
  pendingDeleteAllProfiles,
  profileMessage,
  onChange,
  onCreate,
  onDelete,
  onDeleteAll,
  onOpenImports,
}: {
  profiles: FinancialProfile[]
  activeProfileId: string
  pendingDeleteProfileId: string
  pendingDeleteAllProfiles: boolean
  profileMessage: string
  onChange: (id: string, targetTab?: ProfileTargetTab) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onDeleteAll: () => void
  onOpenImports: () => void
}) {
  const orderedProfiles = profiles
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
  return (
    <section className="profile-strip" aria-label="Perfiles financieros">
      <div className="profile-control">
        <div className="profile-actions">
          <button type="button" className="ghost primary" onClick={() => activeProfile && onChange(activeProfile.id, 'dashboard')}>
            <ChartNoAxesCombined size={18} /> Abrir resumen
          </button>
          <button type="button" className="ghost" onClick={onCreate}>
            <Plus size={18} /> Nuevo espacio
          </button>
          <button type="button" className="ghost" onClick={onOpenImports}>
            <FolderOpen size={18} /> Importar documentos
          </button>
        </div>
        {profileMessage && (
          <p className="profile-message" aria-live="polite">
            {profileMessage}
          </p>
        )}
      </div>
      <div className="profile-cards">
        {orderedProfiles.map((profile) => {
          const facts = profileFacts(profile)
          const isActive = profile.id === activeProfileId
          const isPendingDelete = pendingDeleteProfileId === profile.id
          return (
            <article className={`profile-card ${isActive ? 'active' : ''}`} key={profile.id}>
              <button type="button" className="profile-card-main" onClick={() => onChange(profile.id, 'dashboard')}>
                <div className="profile-badges">
                  <span>{isActive ? 'Activo' : facts.sourceLabel}</span>
                  {facts.isEmpty && <span>Sin datos</span>}
                  {facts.reviewDocs > 0 && <span>{facts.reviewDocs} por revisar</span>}
                </div>
                <strong>{profileDisplayName(profile, profiles)}</strong>
                <small>
                  {facts.accounts} cuenta(s) · {facts.transactions} movimiento(s) · {facts.documents} doc(s) · {facts.goals} meta(s)
                </small>
                <em>Ultimo mes: {facts.latestMonth}</em>
                {Object.keys(facts.docKindCounts).length > 0 && (
                  <small className="review-note">
                    {Object.entries(facts.docKindCounts)
                      .map(([label, count]) => `${count} ${label}`)
                      .join(' · ')}
                  </small>
                )}
              </button>
              <div className="profile-card-actions">
                <button type="button" className="mini-action" onClick={() => onChange(profile.id, 'dashboard')}>
                  <CheckCircle2 size={15} /> Abrir resumen
                </button>
                <button
                  type="button"
                  className={`mini-action danger ${isPendingDelete ? 'confirm' : ''}`}
                  onClick={() => onDelete(profile.id)}
                >
                  <Trash2 size={15} /> {isPendingDelete ? 'Confirmar eliminar' : 'Eliminar'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className={`profile-danger-zone ${pendingDeleteAllProfiles ? 'confirm' : ''}`}>
        <div>
          <strong>Borrar todos los perfiles</strong>
          <span>
            {pendingDeleteAllProfiles
              ? 'Vuelve a tocar el boton rojo para confirmar la eliminacion de todos los perfiles.'
              : 'Elimina todos los perfiles locales y deja la app lista para capturar datos reales desde cero.'}
          </span>
        </div>
        <button
          type="button"
          className={`ghost danger ${pendingDeleteAllProfiles ? 'confirm' : ''}`}
          onClick={onDeleteAll}
          aria-label={pendingDeleteAllProfiles ? 'Confirmar borrar todos los perfiles' : 'Borrar todos los perfiles'}
        >
          <Trash2 size={18} /> {pendingDeleteAllProfiles ? 'Confirmar borrado' : 'Borrar todos los perfiles'}
        </button>
      </div>
    </section>
  )
}

export function ActiveProfileBar({
  profile,
  profiles,
  onOpenDashboard,
  onBackToProfiles,
  onCreate,
  canResetDemo,
  onResetDemo,
}: {
  profile: FinancialProfile
  profiles: FinancialProfile[]
  onOpenDashboard: () => void
  onBackToProfiles: () => void
  onCreate: () => void
  canResetDemo: boolean
  onResetDemo: () => void
}) {
  const facts = profileFacts(profile)
  return (
    <section className="active-context-bar" aria-label="Perfil activo">
      <div>
        <span>Perfil activo</span>
        <strong>{profileDisplayName(profile, profiles)}</strong>
        <small>
          {facts.sourceLabel} · {facts.accounts} cuenta(s) · {facts.transactions} mov. · {facts.documents} doc(s)
        </small>
      </div>
      <div className="active-context-actions">
        <button type="button" className="mini-action primary" onClick={onOpenDashboard}>
          <ChartNoAxesCombined size={15} /> Dashboard
        </button>
        <button type="button" className="mini-action" onClick={onBackToProfiles}>
          Ver perfiles
        </button>
        <button type="button" className="mini-action" onClick={onCreate}>
          Nuevo
        </button>
        {canResetDemo && (
          <button type="button" className="mini-action" onClick={onResetDemo}>
            <RefreshCw size={15} /> Restaurar demo
          </button>
        )}
      </div>
    </section>
  )
}

export function EmptyProfilesState({
  profileMessage,
  onCreate,
  onRestoreExamples,
}: {
  profileMessage: string
  onCreate: () => void
  onRestoreExamples: () => void
}) {
  return (
    <section className="empty-profile-state" aria-label="Sin perfiles financieros">
      <article className="empty-profile-main empty-panel">
        <div className="empty-profile-icon">
          <WalletCards size={28} />
        </div>
        <div>
          <p className="eyebrow">Siguiente accion</p>
          <h2>Crea tu primer espacio financiero</h2>
          <p>
            Agrega cuentas, documentos, movimientos y metas para empezar a ver tu resumen.
          </p>
        </div>
        <div className="empty-profile-actions">
          <button type="button" className="ghost primary" onClick={onCreate}>
            <Plus size={18} /> Crear espacio
          </button>
          <button type="button" className="ghost" onClick={onRestoreExamples}>
            <Target size={18} /> Restaurar ejemplos
          </button>
        </div>
      </article>

      <article className="empty-profile-flow empty-panel" aria-label="Flujo recomendado">
        <div className="empty-panel-heading">
          <span>Flujo recomendado</span>
          <strong>De cero a dashboard en tres pasos</strong>
        </div>
        <div className="empty-flow-steps">
          <div>
            <span>01</span>
            <strong>Perfil</strong>
            <small>Nombre, descripcion y metas iniciales.</small>
          </div>
          <div>
            <span>02</span>
            <strong>Documentos</strong>
            <small>Nomina, tarjetas, bancos o recibos.</small>
          </div>
          <div>
            <span>03</span>
            <strong>Dashboard</strong>
            <small>Salud, flujo, deudas y planeacion.</small>
          </div>
        </div>
      </article>

      <article className="empty-profile-preview empty-panel" aria-label="Vista previa del dashboard financiero">
        <div className="preview-heading">
          <div>
            <span>Preview financiero</span>
            <strong>Tu dashboard se activara aqui</strong>
          </div>
          <ChartNoAxesCombined size={18} />
        </div>
        <div className="preview-metrics">
          <span>
            <strong>--/100</strong>
            Salud
          </span>
          <span>
            <strong>$--</strong>
            Flujo mensual
          </span>
          <span>
            <strong>0</strong>
            Metas activas
          </span>
        </div>
        <div className="preview-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="preview-ledger" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </article>

      <div className="empty-source-grid" aria-label="Datos que puedes capturar">
        <article className="empty-source-card">
          <FolderOpen size={18} />
          <strong>Documentos</strong>
          <small>Estados bancarios, tarjetas y nomina.</small>
        </article>
        <article className="empty-source-card">
          <ChartNoAxesCombined size={18} />
          <strong>Movimientos</strong>
          <small>Ingresos, gastos, deuda y ahorro.</small>
        </article>
        <article className="empty-source-card">
          <Target size={18} />
          <strong>Metas</strong>
          <small>Viajes, autos, inmuebles y reservas.</small>
        </article>
      </div>

      <div className="empty-profile-assurance">
        <CheckCircle2 size={18} />
        <span>Tu workspace local quedo limpio. Los nuevos datos se guardaran por perfil y no se mezclaran con ejemplos.</span>
      </div>
      {profileMessage && (
        <p className="profile-message" aria-live="polite">
          {profileMessage}
        </p>
      )}
    </section>
  )
}
