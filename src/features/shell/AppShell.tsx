import {
  BookOpen,
  ChartNoAxesCombined,
  Database,
  Ellipsis,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Upload,
} from 'lucide-react'
import type { FinancialMetrics } from '../../domain/finance'
import type { FinancialProfile } from '../../domain/types'
import { Capture } from '../capture/Capture'
import type { GoalFormState } from '../goals/goalFormModel'
import { Dashboard } from '../dashboard/Dashboard'
import { Imports } from '../imports/Imports'
import { KnowledgeMatrix } from '../knowledge/KnowledgeMatrix'
import { Planning } from '../planning/Planning'
import { PrivacyPanel } from '../privacy/PrivacyPanel'
import { CreateProfileDialog, type CreateProfileMode } from '../profiles/CreateProfileDialog'
import { ActiveProfileBar, EmptyProfilesState, ProfileSwitcher } from '../profiles/ProfileManagement'
import { profileDisplayName, profileOptionLabel } from '../profiles/profileSummary'

export type AppTab = 'profiles' | 'dashboard' | 'capture' | 'planning' | 'imports' | 'knowledge' | 'privacy' | 'more'

export interface ProfileCreationState {
  isOpen: boolean
  mode: CreateProfileMode
  profileCount: number
  name: string
  description: string
  includeStarterGoal: boolean
  starterGoal: GoalFormState
  starterGoalError: string
  asOfDate: string
  isImporting: boolean
  importQueue: string[]
  onModeChange: (mode: CreateProfileMode) => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onIncludeStarterGoalChange: (value: boolean) => void
  onStarterGoalChange: (value: GoalFormState) => void
  onClose: () => void
  onSubmitManual: () => void
  onFiles: (files: File[]) => void
}

function ProfileCreationSlot({ creation }: { creation: ProfileCreationState }) {
  if (!creation.isOpen) return null

  return (
    <CreateProfileDialog
      mode={creation.mode}
      profileCount={creation.profileCount}
      name={creation.name}
      description={creation.description}
      includeStarterGoal={creation.includeStarterGoal}
      starterGoal={creation.starterGoal}
      starterGoalError={creation.starterGoalError}
      asOfDate={creation.asOfDate}
      isImporting={creation.isImporting}
      importQueue={creation.importQueue}
      onModeChange={creation.onModeChange}
      onNameChange={creation.onNameChange}
      onDescriptionChange={creation.onDescriptionChange}
      onIncludeStarterGoalChange={creation.onIncludeStarterGoalChange}
      onStarterGoalChange={creation.onStarterGoalChange}
      onClose={creation.onClose}
      onSubmitManual={creation.onSubmitManual}
      onFiles={creation.onFiles}
    />
  )
}

export function EmptyWorkspace({
  profileMessage,
  creation,
  onCreateProfile,
  onRestoreExamples,
}: {
  profileMessage: string
  creation: ProfileCreationState
  onCreateProfile: () => void
  onRestoreExamples: () => void
}) {
  return (
    <main className="app-shell empty-shell">
      <div className="empty-brandbar" aria-label="Finanzas OS">
        <div className="empty-brand">
          <div className="brand-mark">
            <ChartNoAxesCombined size={22} />
          </div>
          <div>
            <strong>Finanzas OS</strong>
            <span>Private financial workspace</span>
          </div>
        </div>
      </div>

      <section className="workspace empty-workspace">
        <header className="topbar empty-hero">
          <div>
            <p className="eyebrow">Dashboard financiero personal</p>
            <h1>Empieza limpio, con datos por perfil</h1>
            <p>
              Crea un workspace financiero para cada persona o escenario. Despues importa nomina, estados de cuenta, tarjetas y
              metas para ver salud financiera, flujo y planeacion.
            </p>
            <div className="empty-hero-points" aria-label="Capacidades iniciales">
              <span>Captura real</span>
              <span>Importacion guiada</span>
              <span>Metas por escenario</span>
              <span>Dashboard por perfil</span>
            </div>
            <div className="empty-hero-stats" aria-label="Estado actual del workspace">
              <article>
                <strong>0</strong>
                <span>perfiles activos</span>
              </article>
              <article>
                <strong>0</strong>
                <span>documentos mezclados</span>
              </article>
              <article>
                <strong>Local</strong>
                <span>base SQLite</span>
              </article>
            </div>
          </div>
        </header>

        <EmptyProfilesState profileMessage={profileMessage} onCreate={onCreateProfile} onRestoreExamples={onRestoreExamples} />
        <ProfileCreationSlot creation={creation} />
      </section>
    </main>
  )
}

export function MainAppShell({
  activeTab,
  apiStatus,
  apiMode,
  dbPath,
  profiles,
  currentProfile,
  metrics,
  asOfDate,
  reportingPeriod,
  creation,
  pendingDeleteProfileId,
  pendingDeleteAllProfiles,
  profileMessage,
  importMessage,
  isImporting,
  importQueue,
  onSwitchTab,
  onProfileChange,
  onOpenCreateProfile,
  onOpenDashboardForProfile,
  onRestoreExamples,
  onResetProfile,
  onDeleteProfile,
  onDeleteAllProfiles,
  onUpdateProfile,
  onFiles,
  onReanalyzePersistedDocuments,
  onApplyReviewedDocumentMovements,
  onCreateGoalFromPlanning,
  onReportingPeriodChange,
}: {
  activeTab: AppTab
  apiStatus: 'sqlite'
  apiMode: string
  dbPath: string
  profiles: FinancialProfile[]
  currentProfile: FinancialProfile
  metrics: FinancialMetrics
  asOfDate: string
  reportingPeriod: string
  creation: ProfileCreationState
  pendingDeleteProfileId: string
  pendingDeleteAllProfiles: boolean
  profileMessage: string
  importMessage: string
  isImporting: boolean
  importQueue: string[]
  onSwitchTab: (tab: AppTab) => void
  onProfileChange: (id: string, targetTab?: 'dashboard') => void
  onOpenCreateProfile: (mode?: CreateProfileMode) => void
  onOpenDashboardForProfile: (id?: string) => void
  onRestoreExamples: () => void
  onResetProfile: () => void
  onDeleteProfile: (id: string) => void
  onDeleteAllProfiles: () => void
  onUpdateProfile: (profile: FinancialProfile) => void
  onFiles: (files: File[], mode: 'current' | 'new') => void
  onReanalyzePersistedDocuments: () => void
  onApplyReviewedDocumentMovements: (documentId: string) => void
  onCreateGoalFromPlanning: () => void
  onReportingPeriodChange: (period: string) => void
}) {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegacion principal">
        <div className="brand">
          <div className="brand-mark">
            <ChartNoAxesCombined size={22} />
          </div>
          <div>
            <strong>Finanzas OS</strong>
            <span>Private financial workspace</span>
          </div>
        </div>

        {activeTab !== 'profiles' && (
          <label className="profile-picker">
            Perfil activo
            <select value={currentProfile.id} onChange={(event) => onProfileChange(event.target.value)}>
              {profiles.map((row) => (
                <option key={row.id} value={row.id}>
                  {profileOptionLabel(row, profiles)}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav className="tabs">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => onOpenDashboardForProfile()} aria-label="Estado actual">
            <ChartNoAxesCombined size={18} />
            <span className="tab-label-short">Estado</span>
            <span className="tab-label-full">Estado actual</span>
          </button>
          <button className={activeTab === 'capture' ? 'active' : ''} onClick={() => onSwitchTab('capture')} aria-label="Movimientos">
            <Plus size={18} />
            <span className="tab-label-short">Mov.</span>
            <span className="tab-label-full">Movimientos</span>
          </button>
          <button className={activeTab === 'planning' ? 'active' : ''} onClick={() => onSwitchTab('planning')} aria-label="Metas">
            <Target size={18} />
            <span className="tab-label-short">Metas</span>
            <span className="tab-label-full">Metas</span>
          </button>
          <button className={activeTab === 'imports' ? 'active' : ''} onClick={() => onSwitchTab('imports')} aria-label="Documentos">
            <Upload size={18} />
            <span className="tab-label-short">Docs</span>
            <span className="tab-label-full">Documentos</span>
          </button>
          <button className={['more', 'knowledge', 'privacy'].includes(activeTab) ? 'active' : ''} onClick={() => onSwitchTab('more')} aria-label="Más">
            <Ellipsis size={18} />
            <span className="tab-label-short">Más</span>
            <span className="tab-label-full">Más</span>
          </button>
        </nav>

        <div className="stack-card compact">
          <span>Modo de datos</span>
          <strong>SQLite local conectado</strong>
          {apiStatus === 'sqlite' && dbPath && <small>{dbPath.split('/').at(-1)}</small>}
          {apiMode === 'sqlite-local-lan' && <small>Modo LAN activo: usa solo los orígenes permitidos.</small>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Dashboard financiero personal</p>
            <h1>{activeTab === 'profiles' ? 'Perfiles financieros' : profileDisplayName(currentProfile, profiles)}</h1>
            <p>
              {activeTab === 'profiles'
                ? 'Administra tus perfiles, abre un dashboard especifico o limpia todos los datos locales.'
                : currentProfile.description}
            </p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="ghost primary" onClick={() => onOpenCreateProfile('manual')}>
              <Plus size={18} /> Nuevo perfil
            </button>
            <button type="button" className="ghost" onClick={onRestoreExamples}>
              <Database size={18} /> Restaurar ejemplos
            </button>
            <button type="button" className="ghost danger" onClick={onResetProfile}>
              <RefreshCw size={18} /> Reiniciar perfil
            </button>
          </div>
        </header>

        {activeTab === 'profiles' ? (
          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={currentProfile.id}
            pendingDeleteProfileId={pendingDeleteProfileId}
            pendingDeleteAllProfiles={pendingDeleteAllProfiles}
            profileMessage={profileMessage}
            onChange={(id, targetTab) => {
              if (targetTab === 'dashboard') onOpenDashboardForProfile(id)
              else onProfileChange(id, targetTab)
            }}
            onCreate={() => onOpenCreateProfile('manual')}
            onDelete={onDeleteProfile}
            onDeleteAll={onDeleteAllProfiles}
            onOpenImports={() => onSwitchTab('imports')}
          />
        ) : (
          <ActiveProfileBar
            profile={currentProfile}
            profiles={profiles}
            onOpenDashboard={() => onOpenDashboardForProfile(currentProfile.id)}
            onBackToProfiles={() => onSwitchTab('profiles')}
            onCreate={() => onOpenCreateProfile('manual')}
          />
        )}

        <ProfileCreationSlot creation={creation} />

        {activeTab === 'dashboard' && (
          <Dashboard
            profile={currentProfile}
            metrics={metrics}
            reportingPeriod={reportingPeriod}
            onReportingPeriodChange={onReportingPeriodChange}
            onStartCapture={() => onSwitchTab('capture')}
            onCreateFromDocuments={() => onSwitchTab('imports')}
            onOpenPlanning={() => onSwitchTab('planning')}
          />
        )}
        {activeTab === 'capture' && <Capture profile={currentProfile} asOfDate={asOfDate} onChange={onUpdateProfile} />}
        {activeTab === 'planning' && <Planning profile={currentProfile} metrics={metrics} onCreateGoal={onCreateGoalFromPlanning} />}
        {activeTab === 'imports' && (
          <Imports
            profile={currentProfile}
            importMessage={importMessage}
            isImporting={isImporting}
            importQueue={importQueue}
            onFiles={onFiles}
            onReanalyzePersistedDocuments={onReanalyzePersistedDocuments}
            onApplyReviewedDocumentMovements={onApplyReviewedDocumentMovements}
          />
        )}
        {activeTab === 'more' && (
          <section className="panel more-panel">
            <div className="panel-heading">
              <div>
                <h2>Más herramientas</h2>
                <p>Consulta conceptos financieros y revisa cómo se guardan tus datos locales.</p>
              </div>
              <Ellipsis size={22} />
            </div>
            <div className="empty-actions">
              <button type="button" className="ghost" onClick={() => onSwitchTab('knowledge')}>
                <BookOpen size={18} /> Matriz financiera
              </button>
              <button type="button" className="ghost" onClick={() => onSwitchTab('privacy')}>
                <ShieldCheck size={18} /> Privacidad
              </button>
            </div>
          </section>
        )}
        {activeTab === 'knowledge' && <KnowledgeMatrix />}
        {activeTab === 'privacy' && <PrivacyPanel />}
      </section>
    </main>
  )
}
