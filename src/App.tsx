import { useCallback, useMemo, useState } from 'react'
import './App.css'
import { exampleProfiles } from './domain/exampleData'
import { calculateMetrics } from './domain/finance'
import { recalculateLatestSnapshot } from './domain/snapshots'
import { PROFILE_SCHEMA_VERSION, type FinancialProfile } from './domain/types'
import { defaultGoalForm, goalFormToGoal, validateGoalForm, type GoalFormState } from './features/goals/goalFormModel'
import type { CreateProfileMode } from './features/profiles/CreateProfileDialog'
import { enrichImportedProfileName, profileDisplayName } from './features/profiles/profileSummary'
import { EmptyWorkspace, MainAppShell, type AppTab, type ProfileCreationState } from './features/shell/AppShell'
import { reanalyzePersistedDocuments } from './features/imports/documentQuality'
import type { ReviewedDocumentFields } from './lib/importers'
import { useProfileRepository } from './features/profile/useProfileRepository'
import { setApiAccessToken } from './lib/api'

function safeImportQueueLabel(file: File, index: number) {
  const extension = file.name.split('.').at(-1)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DOC'
  return `${extension} ${index + 1}`
}

function safeUserMessage(message: string) {
  return message.replace(/\b[^\s/\\]+\.(pdf|csv|xml|png|jpg|jpeg|webp)\b/gi, 'archivo')
}

function App() {
  const asOfDate = new Date().toISOString().slice(0, 10)
  const {
    activeProfileId,
    activateProfile,
    apiStatus,
    currentProfile,
    deleteAllStoredProfiles,
    deleteStoredProfile,
    loadProfiles,
    persistProfile,
    profiles,
    replaceProfiles,
    reportingPeriod,
    selectProfile,
    setReportingPeriod,
    updateReportingPeriod,
  } = useProfileRepository(asOfDate)
  const [importMessage, setImportMessage] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importQueue, setImportQueue] = useState<string[]>([])
  const [profileMessage, setProfileMessage] = useState('')
  const [accessToken, setAccessToken] = useState('')
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

  function handleProfileChange(id: string, targetTab?: AppTab): void {
    if (!selectProfile(id)) return
    setImportMessage('')
    setProfileMessage('')
    setPendingDeleteProfileId('')
    setPendingDeleteAllProfiles(false)
    if (targetTab) switchTab(targetTab)
  }
  function openDashboardForProfile(id = activeProfileId): void {
    const selectedProfile = profiles.find((profile) => profile.id === id) ?? currentProfile
    if (!selectedProfile) {
      setActiveTab('profiles')
      return
    }

    activateProfile(selectedProfile)
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
    try {
      await persistProfile(original)
      setProfileMessage('Datos de ejemplo restaurados para este espacio.')
      setImportMessage('Perfil restaurado con datos de ejemplo.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'No se pudo restaurar el perfil.')
    }
  }

  async function handleRestoreExamples(): Promise<void> {
    const firstExample = exampleProfiles[0]
    if (!firstExample) return

    try {
      await Promise.all(exampleProfiles.map((profile) => persistProfile(profile)))
      replaceProfiles(exampleProfiles)
      setPendingDeleteAllProfiles(false)
      setPendingDeleteProfileId('')
      setProfileMessage('Perfiles de ejemplo restaurados.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'No se pudieron restaurar los perfiles.')
    }
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
    try {
      await persistProfile(profile)
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'No se pudo crear el perfil.')
      return
    }
    activateProfile(profile)
    switchTab(firstGoal ? 'planning' : 'capture')
    setPendingDeleteProfileId('')
    setIsCreateProfileOpen(false)
    setProfileMessage(
      firstGoal
        ? `${name} creado con la meta ${firstGoal.name}. Revisa si la aportacion mensual alcanza.`
        : `${name} creado. Empieza agregando tu cuenta base para que el dashboard tenga un saldo inicial.`,
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
      activateProfile(recalculatedProfile)
      switchTab('imports')
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
    try {
      const recalculatedProfile = recalculateLatestSnapshot(profile, asOfDate)
      await persistProfile(recalculatedProfile)
      updateReportingPeriod(recalculatedProfile)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el perfil.'
      setProfileMessage(message)
      setImportMessage(message)
    }
  }

  async function handleApplyReviewedDocumentMovements(documentId: string, fields: ReviewedDocumentFields = {}) {
    if (!currentProfile) return
    try {
      const { applyReviewedDocument } = await import('./lib/importers')
      const result = applyReviewedDocument(currentProfile, documentId, fields)
      await persistProfile(recalculateLatestSnapshot(result.profile, asOfDate))
      const appliedRows = Number(result.document.extracted?.reviewedMovementRowsApplied ?? 0)
      const message = result.document.kind === 'payroll_cfdi'
        ? `Nomina revisada aplicada: ${appliedRows} ingreso(s). El nombre del documento se mantiene oculto.`
        : `Movimientos revisados aplicados: ${appliedRows}. El nombre del documento se mantiene oculto.`
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

  async function handleDeleteProfile(id: string): Promise<void> {
    const targetProfile = profiles.find((profile) => profile.id === id)
    if (!targetProfile) return

    const targetName = profileDisplayName(targetProfile, profiles)
    setPendingDeleteAllProfiles(false)
    if (pendingDeleteProfileId !== id) {
      setPendingDeleteProfileId(id)
      setProfileMessage('Confirma para eliminar ' + targetName + '. Esta accion no se puede deshacer.')
      return
    }

    try {
      const nextProfiles = await deleteStoredProfile(id)
      setPendingDeleteProfileId('')
      setActiveTab('profiles')
      setProfileMessage(
        nextProfiles.length === 0
          ? targetName + ' fue eliminado. Crea un perfil nuevo para empezar con datos reales.'
          : targetName + ' fue eliminado.',
      )
    } catch (error) {
      setPendingDeleteProfileId('')
      setProfileMessage(error instanceof Error ? error.message : 'No se pudo eliminar el perfil.')
    }
  }
  async function handleDeleteAllProfiles(): Promise<void> {
    if (profiles.length === 0) return

    if (!pendingDeleteAllProfiles) {
      setPendingDeleteAllProfiles(true)
      setPendingDeleteProfileId('')
      setProfileMessage('Confirma para eliminar ' + profiles.length + ' perfiles. Esta accion no se puede deshacer.')
      return
    }

    try {
      await deleteAllStoredProfiles()
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
    return <main className="loading">Cargando datos...</main>
  }

  if (apiStatus === 'authentication_required') {
    return (
      <main className="loading blocked-storage">
        <form className="panel" onSubmit={(event) => {
          event.preventDefault()
          setApiAccessToken(accessToken)
          setAccessToken('')
          void loadProfiles()
        }}>
          <p className="eyebrow">Datos protegidos</p>
          <h1>Conecta con tus finanzas</h1>
          <p>Introduce la clave que aparece en la terminal al iniciar la API. Se conserva solo en esta pestaña.</p>
          <label>Clave de acceso
            <input autoComplete="off" type="password" required value={accessToken} onChange={(event) => setAccessToken(event.target.value)} />
          </label>
          <button type="submit" className="action-button">Conectar</button>
        </form>
      </main>
    )
  }

  if (apiStatus === 'blocked') {
    return (
      <main className="loading blocked-storage">
        <section className="panel">
          <p className="eyebrow">Datos protegidos</p>
          <h1>No se pudo abrir tu información financiera</h1>
          <p>La app no escribira una copia distinta de tus finanzas. Revisa la conexión e intenta de nuevo.</p>
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
      navigation={{
        activeTab,
        asOfDate,
        reportingPeriod,
        onSwitchTab: switchTab,
        onReportingPeriodChange: setReportingPeriod,
      }}
      profile={{
        canResetProfile: exampleProfiles.some((profile) => profile.id === currentProfile.id),
        profiles,
        currentProfile,
        creation: profileCreation,
        pendingDeleteProfileId,
        pendingDeleteAllProfiles,
        profileMessage,
        onProfileChange: (id, targetTab) => handleProfileChange(id, targetTab),
        onOpenCreateProfile: openCreateProfile,
        onOpenDashboardForProfile: openDashboardForProfile,
        onRestoreExamples: () => void handleRestoreExamples(),
        onResetProfile: () => void handleReset(),
        onDeleteProfile: (id) => void handleDeleteProfile(id),
        onDeleteAllProfiles: () => void handleDeleteAllProfiles(),
        onUpdateProfile: (next) => void updateProfile(next),
        onCreateGoalFromPlanning: () => {
          switchTab('capture')
          setProfileMessage('Crea una meta y después regresa Planeación para revisar su factibilidad.')
        },
      }}
      documents={{
        importMessage,
        isImporting,
        importQueue,
        onFiles: (files, mode) => void handleFiles(files, mode),
        onReanalyzePersistedDocuments: () => void handleReanalyzePersistedDocuments(),
    onApplyReviewedDocumentMovements: (documentId, fields) => void handleApplyReviewedDocumentMovements(documentId, fields),
      }}
      metrics={metrics}
    />
  )
}

export default App
