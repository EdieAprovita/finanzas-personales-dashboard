import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { exampleProfiles } from './domain/exampleData'
import { calculateMetrics } from './domain/finance'
import { latestReportingPeriod, migrateFinancialProfile } from './domain/profile'
import { recalculateLatestSnapshot } from './domain/snapshots'
import { PROFILE_SCHEMA_VERSION, type FinancialProfile } from './domain/types'
import { defaultGoalForm, goalFormToGoal, validateGoalForm, type GoalFormState } from './features/goals/goalFormModel'
import type { CreateProfileMode } from './features/profiles/CreateProfileDialog'
import { enrichImportedProfileName, profileDisplayName } from './features/profiles/profileSummary'
import { EmptyWorkspace, MainAppShell, type AppTab, type ProfileCreationState } from './features/shell/AppShell'
import { deleteAllProfiles, deleteProfile, getApiHealth, getProfiles, saveProfile } from './lib/api'
import { reanalyzePersistedDocuments } from './features/imports/documentQuality'

function safeImportQueueLabel(file: File, index: number) {
  const extension = file.name.split('.').at(-1)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DOC'
  return `${extension} ${index + 1}`
}

function safeUserMessage(message: string) {
  return message.replace(/\b[^\s/\\]+\.(pdf|csv|xml|png|jpg|jpeg|webp)\b/gi, 'archivo')
}

function App() {
  const asOfDate = new Date().toISOString().slice(0, 10)
  const [activeProfileId, setActiveProfileId] = useState('')
  const [profiles, setProfiles] = useState<FinancialProfile[]>([])
  const [apiStatus, setApiStatus] = useState<'checking' | 'sqlite' | 'blocked'>('checking')
  const [apiMode, setApiMode] = useState('sqlite-local-file')
  const [dbPath, setDbPath] = useState('')
  const [reportingPeriod, setReportingPeriod] = useState(asOfDate.slice(0, 7))
  const [importMessage, setImportMessage] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importQueue, setImportQueue] = useState<string[]>([])
  const [profileMessage, setProfileMessage] = useState('')
  const [pendingDeleteProfileId, setPendingDeleteProfileId] = useState('')
  const [pendingDeleteAllProfiles, setPendingDeleteAllProfiles] = useState(false)
  const [isCreateProfileOpen, setIsCreateProfileOpen] = useState(false)
  const [createProfileMode, setCreateProfileMode] = useState<CreateProfileMode>('manual')
  const [manualProfileName, setManualProfileName] = useState('')
  const [manualProfileDescription, setManualProfileDescription] = useState('')
  const [includeStarterGoal, setIncludeStarterGoal] = useState(false)
  const [starterGoal, setStarterGoal] = useState<GoalFormState>(() => defaultGoalForm('savings', asOfDate))
  const [starterGoalError, setStarterGoalError] = useState('')
  const [activeTab, setActiveTab] = useState<AppTab>('profiles')

  const loadProfiles = useCallback(async (): Promise<void> => {
    try {
      const health = await getApiHealth()
      setDbPath(health.dbFile)
      setApiMode(health.mode)
      setApiStatus('sqlite')
      const apiProfiles = await getProfiles()
      if (apiProfiles.length === 0) {
        setProfiles([])
        setActiveProfileId('')
      } else {
        const hydratedProfiles = apiProfiles.map(migrateFinancialProfile)
        setProfiles(hydratedProfiles)
        setActiveProfileId((current) => {
          const selected = hydratedProfiles.find((profile) => profile.id === current) ?? hydratedProfiles[0]
          if (!selected) return ''
          setReportingPeriod(latestReportingPeriod(selected, asOfDate.slice(0, 7)))
          return selected.id
        })
      }
    } catch {
      setApiStatus('blocked')
    }
  }, [asOfDate, setActiveProfileId, setApiMode, setApiStatus, setDbPath, setProfiles, setReportingPeriod])

  const currentProfile = profiles.find((row) => row.id === activeProfileId) ?? profiles[0]
  const metrics = useMemo(
    () => (currentProfile ? calculateMetrics(currentProfile, { period: reportingPeriod, asOfDate }) : null),
    [asOfDate, currentProfile, reportingPeriod],
  )

  function switchTab(tab: AppTab) {
    if (tab !== 'profiles') {
      setPendingDeleteProfileId('')
      setPendingDeleteAllProfiles(false)
    }
    setActiveTab(tab)
  }

  function openCreateProfile(mode: CreateProfileMode = 'manual') {
    setCreateProfileMode(mode)
    setManualProfileName(`Mi plan financiero ${profiles.length + 1}`)
    setManualProfileDescription('')
    setImportMessage('')
    setProfileMessage('')
    setPendingDeleteAllProfiles(false)
    setPendingDeleteProfileId('')
    setIncludeStarterGoal(false)
    setStarterGoal(defaultGoalForm('savings', asOfDate))
    setStarterGoalError('')
    setIsCreateProfileOpen(true)
  }

  const closeCreateProfile = useCallback((): void => {
    setIsCreateProfileOpen(false)
  }, [])

  async function handleProfileChange(id: string, targetTab?: AppTab) {
    const selectedProfile = profiles.find((profile) => profile.id === id)
    if (!selectedProfile) return
    setActiveProfileId(selectedProfile.id)
    setReportingPeriod(latestReportingPeriod(selectedProfile, asOfDate.slice(0, 7)))
    setImportMessage('')
    setProfileMessage('')
    setPendingDeleteProfileId('')
    setPendingDeleteAllProfiles(false)
    if (targetTab) switchTab(targetTab)
  }

  function openDashboardForProfile(id = activeProfileId) {
    const selectedProfile = profiles.find((profile) => profile.id === id) ?? currentProfile
    if (!selectedProfile) {
      setActiveTab('profiles')
      return
    }
    setActiveProfileId(selectedProfile.id)
    setReportingPeriod(latestReportingPeriod(selectedProfile, asOfDate.slice(0, 7)))
    setImportMessage('')
    setProfileMessage('')
    setPendingDeleteProfileId('')
    setPendingDeleteAllProfiles(false)
    setActiveTab('dashboard')
  }

  async function handleReset() {
    if (!currentProfile) return
    const original = exampleProfiles.find((row) => row.id === currentProfile.id)
    if (!original) {
      setProfileMessage('Este perfil no es de ejemplo. Usa Eliminar si quieres retirarlo o captura nuevos datos encima.')
      return
    }
    await persistProfile(original)
    setImportMessage('Perfil restaurado con datos de ejemplo.')
  }

  async function handleRestoreExamples() {
    const firstExample = exampleProfiles[0]
    if (!firstExample) return
    await Promise.all(exampleProfiles.map((profile) => persistProfile(profile)))
    setProfiles(exampleProfiles)
    setActiveProfileId(firstExample.id)
    setReportingPeriod(latestReportingPeriod(firstExample, asOfDate.slice(0, 7)))
    setPendingDeleteAllProfiles(false)
    setPendingDeleteProfileId('')
    setProfileMessage('Perfiles de ejemplo restaurados.')
  }

  async function handleCreateManualProfile() {
    const firstGoalError = includeStarterGoal ? validateGoalForm(starterGoal, asOfDate) : ''
    if (firstGoalError) {
      setStarterGoalError(firstGoalError)
      return
    }
    const existingIds = new Set(profiles.map((profile) => profile.id))
    let profileIndex = profiles.length + 1
    while (existingIds.has(`personal-${profileIndex}`)) profileIndex += 1
    const id = `personal-${profileIndex}`
    const name = manualProfileName.trim() || `Mi plan financiero ${profileIndex}`
    const firstGoal = includeStarterGoal ? goalFormToGoal(starterGoal, new Date().toISOString()) : null
    const profile: FinancialProfile = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      reportingCurrency: 'MXN',
      id,
      name,
      description: manualProfileDescription.trim() || 'Perfil personal listo para capturar cuentas, movimientos, documentos y metas.',
      grossMonthlyIncome: 0,
      netMonthlyIncome: 0,
      accounts: [],
      transactions: [],
      debts: [],
      goals: firstGoal ? [firstGoal] : [],
      budgets: [
        'Vivienda',
        'Supermercado',
        'Transporte',
        'Restaurantes',
        'Salud',
        'Viajes',
        'Suscripciones',
        'Educacion',
      ].map((category) => ({ category, monthlyLimit: 0 })),
      monthlySnapshots: [
        {
          month: new Date().toISOString().slice(0, 7),
          income: 0,
          expenses: 0,
          debtPayments: 0,
          savings: 0,
          netWorth: 0,
        },
      ],
      importedDocuments: [],
    }
    await persistProfile(profile)
    setActiveProfileId(id)
    switchTab(firstGoal ? 'planning' : 'capture')
    setPendingDeleteProfileId('')
    setIsCreateProfileOpen(false)
    setProfileMessage(
      firstGoal
        ? `${name} creado con la meta ${firstGoal.name}. Revisa si la aportacion mensual alcanza.`
        : `${name} creado. Empieza capturando una cuenta, un movimiento o una meta.`,
    )
    setImportMessage('')
  }

  function createImportProfile(files: File[]): FinancialProfile {
    const existingIds = new Set(profiles.map((profile) => profile.id))
    let profileIndex = profiles.length + 1
    while (existingIds.has(`import-${profileIndex}`)) profileIndex += 1
    const id = `import-${profileIndex}`
    return {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      reportingCurrency: 'MXN',
      id,
      name: `Perfil importado ${profileIndex}`,
      description: `Perfil creado desde ${files.length} documento(s) financieros.`,
      grossMonthlyIncome: 0,
      netMonthlyIncome: 0,
      accounts: [],
      transactions: [],
      debts: [],
      goals: [],
      budgets: ['Vivienda', 'Supermercado', 'Transporte', 'Restaurantes', 'Salud', 'Viajes', 'Suscripciones', 'Comisiones e intereses'].map(
        (category) => ({ category, monthlyLimit: 0 }),
      ),
      monthlySnapshots: [
        {
          month: new Date().toISOString().slice(0, 7),
          income: 0,
          expenses: 0,
          debtPayments: 0,
          savings: 0,
          netWorth: 0,
        },
      ],
      importedDocuments: [],
    }
  }

  async function handleFiles(files: File[], mode: 'current' | 'new') {
    if (!files.length) return
    const baseProfile = mode === 'new' ? createImportProfile(files) : currentProfile
    if (!baseProfile) return
    setIsImporting(true)
    setImportMessage('')
    setImportQueue(files.map(safeImportQueueLabel))

    try {
      const { importFinancialFiles } = await import('./lib/importers')
      const result = await importFinancialFiles(baseProfile, files)
      const importedProfile = mode === 'new' ? enrichImportedProfileName(result.profile, result.documents) : result.profile
      const recalculatedProfile = recalculateLatestSnapshot(importedProfile, asOfDate)
      await persistProfile(recalculatedProfile)
      setActiveProfileId(importedProfile.id)
      setReportingPeriod(latestReportingPeriod(recalculatedProfile, asOfDate.slice(0, 7)))
      switchTab(mode === 'new' ? 'dashboard' : 'imports')
      setPendingDeleteProfileId('')
      if (mode === 'new') setIsCreateProfileOpen(false)
      setProfileMessage(safeUserMessage(result.summary))
      setImportMessage(safeUserMessage(result.summary))
    } catch (error) {
      setImportMessage(error instanceof Error ? safeUserMessage(error.message) : 'No se pudo procesar el archivo.')
    } finally {
      setIsImporting(false)
      setImportQueue([])
    }
  }

  async function updateProfile(profile: FinancialProfile) {
    const recalculatedProfile = recalculateLatestSnapshot(profile, asOfDate)
    await persistProfile(recalculatedProfile)
    setReportingPeriod(latestReportingPeriod(recalculatedProfile, asOfDate.slice(0, 7)))
  }

  async function handleApplyReviewedDocumentMovements(documentId: string) {
    if (!currentProfile) return
    try {
      const { applyReviewedStatementMovements } = await import('./lib/importers')
      const result = applyReviewedStatementMovements(currentProfile, documentId)
      await persistProfile(recalculateLatestSnapshot(result.profile, asOfDate))
      const appliedRows = Number(result.document.extracted?.reviewedMovementRowsApplied ?? 0)
      const message = `Movimientos revisados aplicados: ${appliedRows}. El nombre del documento se mantiene oculto.`
      setImportMessage(message)
      setProfileMessage(message)
      switchTab('imports')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron aplicar los movimientos revisados.'
      setImportMessage(message)
      setProfileMessage(message)
    }
  }

  async function handleReanalyzePersistedDocuments() {
    if (!currentProfile) return
    try {
      const result = reanalyzePersistedDocuments(currentProfile)
      await persistProfile(recalculateLatestSnapshot(result.profile, asOfDate))
      const missingSuffix = result.missingFields.length > 0 ? ` Campos faltantes principales: ${result.missingFields.slice(0, 4).join(', ')}.` : ''
      setImportMessage(`${result.summary}${missingSuffix}`)
      setProfileMessage(result.summary)
      switchTab('imports')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo reanalizar la metadata de documentos.'
      setImportMessage(message)
      setProfileMessage(message)
    }
  }

  async function persistProfile(profile: FinancialProfile) {
    if (apiStatus !== 'sqlite') throw new Error('SQLite local no esta disponible. Reintenta cuando la API este activa.')
    await saveProfile(profile)
    setProfiles((current) => {
      const exists = current.some((row) => row.id === profile.id)
      return exists ? current.map((row) => (row.id === profile.id ? profile : row)) : [profile, ...current]
    })
  }

  async function handleDeleteProfile(id: string) {
    const targetProfile = profiles.find((profile) => profile.id === id)
    if (!targetProfile) return
    setPendingDeleteAllProfiles(false)
    if (pendingDeleteProfileId !== id) {
      setPendingDeleteProfileId(id)
      setProfileMessage(`Confirma para eliminar ${profileDisplayName(targetProfile, profiles)}. Esta accion no se puede deshacer.`)
      return
    }

    try {
      if (apiStatus !== 'sqlite') throw new Error('SQLite local no esta disponible. Reintenta cuando la API este activa.')
      await deleteProfile(id)

      const nextProfiles = profiles.filter((profile) => profile.id !== id)
      if (nextProfiles.length === 0) {
        setActiveProfileId('')
      } else if (id === activeProfileId) {
        const nextProfile = nextProfiles[0]
        if (nextProfile) {
          setActiveProfileId(nextProfile.id)
          setReportingPeriod(latestReportingPeriod(nextProfile, asOfDate.slice(0, 7)))
        }
      }
      setProfiles(nextProfiles)
      setPendingDeleteProfileId('')
      setActiveTab('profiles')
      setProfileMessage(
        nextProfiles.length === 0
          ? `${profileDisplayName(targetProfile, profiles)} fue eliminado. Crea un perfil nuevo para empezar con datos reales.`
          : `${profileDisplayName(targetProfile, profiles)} fue eliminado.`,
      )
    } catch (error) {
      setPendingDeleteProfileId('')
      setProfileMessage(error instanceof Error ? error.message : 'No se pudo eliminar el perfil.')
    }
  }

  async function handleDeleteAllProfiles() {
    if (profiles.length === 0) return
    if (!pendingDeleteAllProfiles) {
      setPendingDeleteAllProfiles(true)
      setPendingDeleteProfileId('')
      setProfileMessage(
        `Confirma para eliminar ${profiles.length} perfil(es). La app quedara lista para crear un perfil nuevo o restaurar ejemplos.`,
      )
      return
    }

    try {
      if (apiStatus !== 'sqlite') throw new Error('SQLite local no esta disponible. Reintenta cuando la API este activa.')
      await deleteAllProfiles()
      setProfiles([])
      setActiveProfileId('')
      setActiveTab('profiles')
      setPendingDeleteAllProfiles(false)
      setPendingDeleteProfileId('')
      setProfileMessage('Todos los perfiles fueron eliminados. Crea un perfil nuevo para empezar con datos reales.')
      setImportMessage('')
    } catch (error) {
      setPendingDeleteAllProfiles(false)
      setProfileMessage(error instanceof Error ? error.message : 'No se pudieron eliminar todos los perfiles.')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProfiles(), 0)
    return () => window.clearTimeout(timer)
  }, [loadProfiles])

  const profileCreation: ProfileCreationState = {
    isOpen: isCreateProfileOpen,
    mode: createProfileMode,
    profileCount: profiles.length,
    name: manualProfileName,
    description: manualProfileDescription,
    includeStarterGoal,
    starterGoal,
    starterGoalError,
    asOfDate,
    isImporting,
    importQueue,
    onModeChange: setCreateProfileMode,
    onNameChange: setManualProfileName,
    onDescriptionChange: setManualProfileDescription,
    onIncludeStarterGoalChange: setIncludeStarterGoal,
    onStarterGoalChange: (next) => {
      setStarterGoal(next)
      setStarterGoalError('')
    },
    onClose: closeCreateProfile,
    onSubmitManual: () => void handleCreateManualProfile(),
    onFiles: (files) => void handleFiles(files, 'new'),
  }

  if (apiStatus === 'checking') {
    return <main className="loading">Cargando datos locales...</main>
  }

  if (apiStatus === 'blocked') {
    return (
      <main className="loading blocked-storage">
        <section className="panel">
          <p className="eyebrow">Datos protegidos</p>
          <h1>No se pudo abrir SQLite local</h1>
          <p>La app no escribira una copia distinta de tus finanzas. Inicia la API local y vuelve a intentar.</p>
          <button type="button" className="action-button" onClick={() => void loadProfiles()}>
            Reintentar conexion
          </button>
        </section>
      </main>
    )
  }

  if (profiles.length === 0) {
    return (
      <EmptyWorkspace
        profileMessage={profileMessage}
        creation={profileCreation}
        onCreateProfile={() => openCreateProfile('manual')}
        onRestoreExamples={() => void handleRestoreExamples()}
      />
    )
  }

  if (!currentProfile || !metrics) {
    return <main className="loading">Cargando datos locales...</main>
  }

  return (
    <MainAppShell
      activeTab={activeTab}
      apiStatus={apiStatus}
      apiMode={apiMode}
      dbPath={dbPath}
      profiles={profiles}
      currentProfile={currentProfile}
      metrics={metrics}
      asOfDate={asOfDate}
      reportingPeriod={reportingPeriod}
      creation={profileCreation}
      pendingDeleteProfileId={pendingDeleteProfileId}
      pendingDeleteAllProfiles={pendingDeleteAllProfiles}
      profileMessage={profileMessage}
      importMessage={importMessage}
      isImporting={isImporting}
      importQueue={importQueue}
      onSwitchTab={switchTab}
      onProfileChange={(id, targetTab) => void handleProfileChange(id, targetTab)}
      onOpenCreateProfile={openCreateProfile}
      onOpenDashboardForProfile={openDashboardForProfile}
      onRestoreExamples={() => void handleRestoreExamples()}
      onResetProfile={() => void handleReset()}
      onDeleteProfile={(id) => void handleDeleteProfile(id)}
      onDeleteAllProfiles={() => void handleDeleteAllProfiles()}
      onUpdateProfile={(next) => void updateProfile(next)}
      onFiles={(files, mode) => void handleFiles(files, mode)}
      onReanalyzePersistedDocuments={() => void handleReanalyzePersistedDocuments()}
      onApplyReviewedDocumentMovements={(documentId) => void handleApplyReviewedDocumentMovements(documentId)}
      onCreateGoalFromPlanning={() => {
        switchTab('capture')
        setProfileMessage('Crea una meta y despues regresa a Planeacion para revisar su factibilidad.')
      }}
      onReportingPeriodChange={setReportingPeriod}
    />
  )
}

export default App
