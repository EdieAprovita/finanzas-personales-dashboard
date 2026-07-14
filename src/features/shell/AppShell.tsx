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

const sectionCopy: Record<AppTab, { title: string; description: string }> = {
  profiles: {
    title: 'Tus espacios financieros',
    description: 'Elige lo que quieres revisar o crea un espacio nuevo para separar un objetivo.',
  },
  dashboard: {
    title: 'Resumen financiero',
    description: 'Revisa salud financiera, flujo, presupuesto y alertas del periodo.',
  },
  capture: {
    title: 'Registrar actividad',
    description: 'Agrega cuentas, movimientos e ingresos que quieras seguir.',
  },
  planning: {
    title: 'Metas y plan',
    description: 'Compara tus metas contra la capacidad de ahorro registrada.',
  },
  imports: {
    title: 'Documentos',
    description: 'Importa, revisa y aplica la información detectada de forma local.',
  },
  knowledge: {
    title: 'Guía financiera',
    description: 'Consulta los conceptos que aparecen en tus documentos financieros.',
  },
  privacy: {
    title: 'Privacidad y datos',
    description: 'Revisa cómo se almacenan y protegen tus datos en esta computadora.',
  },
  more: {
    title: 'Más herramientas',
    description: 'Accede a la guía financiera y a los controles de privacidad.',
  },
}

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
            <span>Finanzas personales</span>
          </div>
        </div>
      </div>

      <section className="workspace empty-workspace">
        <header className="topbar empty-hero">
          <div>
            <p className="eyebrow">Dashboard financiero personal</p>
            <h1>Empieza con tu información financiera</h1>
            <p>
              Crea un espacio para organizar tus cuentas, movimientos y metas. Puedes importar documentos cuando estés listo.
            </p>
            <div className="empty-hero-points" aria-label="Capacidades iniciales">
              <span>Registra tus movimientos</span>
              <span>Importa documentos</span>
              <span>Planea una meta</span>
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
  canResetProfile,
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
  canResetProfile: boolean
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
  const section = sectionCopy[activeTab]
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegacion principal">
        <div className="brand">
          <div className="brand-mark">
            <ChartNoAxesCombined size={22} />
          </div>
          <div>
            <strong>Finanzas OS</strong>
            <span>Finanzas personales</span>
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
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => onOpenDashboardForProfile()} aria-label="Resumen">
            <ChartNoAxesCombined size={18} />
            <span className="tab-label-short">Resumen</span>
            <span className="tab-label-full">Resumen</span>
          </button>
          <button className={activeTab === 'capture' ? 'active' : ''} onClick={() => onSwitchTab('capture')} aria-label="Registrar">
            <Plus size={18} />
            <span className="tab-label-short">Registrar</span>
            <span className="tab-label-full">Registrar</span>
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

      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTab === 'profiles' ? 'Organización financiera' : profileDisplayName(currentProfile, profiles)}</p>
            <h1>{section.title}</h1>
            <p>{section.description}</p>
          </div>
          <div className="topbar-actions">
            {activeTab === 'profiles' ? (
              <>
                <button type="button" className="ghost primary" onClick={() => onOpenCreateProfile('manual')}>
                  <Plus size={18} /> Nuevo espacio
                </button>
                <button type="button" className="ghost" onClick={onRestoreExamples}>
                  <Database size={18} /> Restaurar ejemplos
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ghost primary" onClick={() => onSwitchTab('capture')}>
                  <Plus size={18} /> Registrar
                </button>
                <button type="button" className="ghost" onClick={() => onSwitchTab('imports')}>
                  <Upload size={18} /> Importar
                </button>
                {canResetProfile && (
                  <button type="button" className="ghost" onClick={onResetProfile}>
                    <RefreshCw size={18} /> Restaurar demo
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {activeTab !== 'profiles' && profileMessage === 'Datos de ejemplo restaurados para este espacio.' && (
          <p className="workspace-message" aria-live="polite">{profileMessage}</p>
        )}

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
            canResetDemo={canResetProfile}
            onResetDemo={onResetProfile}
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
