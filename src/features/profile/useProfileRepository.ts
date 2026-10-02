import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { latestReportingPeriod, migrateFinancialProfile } from '../../domain/profile'
import type { FinancialProfile } from '../../domain/types'
import { ApiAuthenticationError, deleteAllProfiles, deleteProfile, getApiHealth, getProfiles, saveProfile, undoLatestImport } from '../../lib/api'

export type ProfileApiStatus = 'checking' | 'sqlite' | 'blocked' | 'authentication_required'

export interface ProfileRepository {
  apiStatus: ProfileApiStatus
  profiles: FinancialProfile[]
  undoableImportProfileIds: Set<string>
  activeProfileId: string
  currentProfile: FinancialProfile | undefined
  reportingPeriod: string
  setReportingPeriod: (period: string) => void
  updateReportingPeriod: (profile: FinancialProfile) => void
  loadProfiles: () => Promise<void>
  activateProfile: (profile: FinancialProfile) => void
  selectProfile: (id: string) => FinancialProfile | undefined
  persistProfile: (profile: FinancialProfile, options?: { operation?: 'import_batch' }) => Promise<void>
  undoLatestImportForProfile: (id: string) => Promise<boolean>
  deleteStoredProfile: (id: string) => Promise<FinancialProfile[]>
  deleteAllStoredProfiles: () => Promise<void>
  replaceProfiles: (nextProfiles: FinancialProfile[]) => void
}

function storageUnavailableError(): Error {
  return new Error('SQLite local no esta disponible. Reintenta cuando la API este activa.')
}

export function useProfileRepository(asOfDate: string): ProfileRepository {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const revisionsRef = useRef(new Map<string, number>())
  const [undoableImportProfileIds, setUndoableImportProfileIds] = useState(new Set<string>())
  const [activeProfileId, setActiveProfileId] = useState('')
  const [profiles, setProfiles] = useState<FinancialProfile[]>([])
  const [apiStatus, setApiStatus] = useState<ProfileApiStatus>('checking')
  const [reportingPeriod, setReportingPeriod] = useState(asOfDate.slice(0, 7))

  const activateProfile = useCallback(
    (profile: FinancialProfile): void => {
      setActiveProfileId(profile.id)
      setReportingPeriod(latestReportingPeriod(profile, asOfDate.slice(0, 7)))
    },
    [asOfDate],
  )

  const selectProfile = useCallback(
    (id: string): FinancialProfile | undefined => {
      const selectedProfile = profiles.find((profile) => profile.id === id)
      if (!selectedProfile) return undefined

      activateProfile(selectedProfile)
      return selectedProfile
    },
    [activateProfile, profiles],
  )

  const updateReportingPeriod = useCallback(
    (profile: FinancialProfile): void => {
      setReportingPeriod(latestReportingPeriod(profile, asOfDate.slice(0, 7)))
    },
    [asOfDate],
  )

  const loadProfiles = useCallback(async (): Promise<void> => {
    try {
      await getApiHealth()
      setApiStatus('sqlite')
      const { profiles: apiProfiles, revisions, importUndos } = await getProfiles()
      revisionsRef.current = new Map(Object.entries(revisions))
      setUndoableImportProfileIds(new Set(Object.keys(importUndos)))

      if (apiProfiles.length === 0) {
        revisionsRef.current.clear()
        setProfiles([])
        setActiveProfileId('')
        return
      }

      const hydratedProfiles = apiProfiles.map(migrateFinancialProfile)
      setProfiles(hydratedProfiles)
      setActiveProfileId((current) => {
        const selected = hydratedProfiles.find((profile) => profile.id === current) ?? hydratedProfiles[0]
        if (!selected) return ''
        setReportingPeriod(latestReportingPeriod(selected, asOfDate.slice(0, 7)))
        return selected.id
      })
    } catch (error) {
      setApiStatus(error instanceof ApiAuthenticationError ? 'authentication_required' : 'blocked')
    }
  }, [asOfDate])

  const persistProfile = useCallback(
    async (profile: FinancialProfile, options?: { operation?: 'import_batch' }): Promise<void> => {
      const saveOperation = saveQueueRef.current.then(async () => {
        if (apiStatus !== 'sqlite') throw storageUnavailableError()

        try {
          const saved = await saveProfile(profile, revisionsRef.current.get(profile.id), options?.operation)
          revisionsRef.current.set(profile.id, saved.revision)
          profile = migrateFinancialProfile(saved.profile)
          setUndoableImportProfileIds((current) => {
            const next = new Set(current)
            if (options?.operation === 'import_batch') next.add(profile.id)
            else next.delete(profile.id)
            return next
          })
        } catch (error) {
          if (error instanceof ApiAuthenticationError) setApiStatus('authentication_required')
          throw error
        }
        setProfiles((current) => {
          const exists = current.some((row) => row.id === profile.id)
          return exists
            ? current.map((row) => (row.id === profile.id ? profile : row))
            : [profile, ...current]
        })
      })

      saveQueueRef.current = saveOperation.catch(() => undefined)
      await saveOperation
    },
    [apiStatus],
  )

  const undoLatestImportForProfile = useCallback(async (id: string): Promise<boolean> => {
    if (apiStatus !== 'sqlite') throw storageUnavailableError()
    const revision = revisionsRef.current.get(id)
    if (!revision) throw new Error('Recarga el perfil antes de deshacer la importacion.')
    let result: Awaited<ReturnType<typeof undoLatestImport>>
    try {
      result = await undoLatestImport(id, revision)
    } catch (error) {
      if (error instanceof ApiAuthenticationError) setApiStatus('authentication_required')
      throw error
    }
    setUndoableImportProfileIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    if (result.deleted) {
      revisionsRef.current.delete(id)
      const nextProfiles = profiles.filter((profile) => profile.id !== id)
      setProfiles(nextProfiles)
      const nextProfile = nextProfiles[0]
      if (nextProfile) activateProfile(nextProfile)
      else setActiveProfileId('')
      return true
    }
    if (!result.profile || !result.revision) throw new Error('La API no devolvio el perfil restaurado.')
    const restored = migrateFinancialProfile(result.profile)
    revisionsRef.current.set(id, result.revision)
    setProfiles((current) => current.map((profile) => profile.id === id ? restored : profile))
    activateProfile(restored)
    return false
  }, [activateProfile, apiStatus, profiles])

  const deleteStoredProfile = useCallback(
    async (id: string): Promise<FinancialProfile[]> => {
      if (apiStatus !== 'sqlite') throw storageUnavailableError()

      try {
        const revision = revisionsRef.current.get(id)
        if (!revision) throw new Error('Recarga el perfil antes de eliminarlo.')
        await deleteProfile(id, revision)
        revisionsRef.current.delete(id)
      } catch (error) {
        if (error instanceof ApiAuthenticationError) setApiStatus('authentication_required')
        throw error
      }
      setUndoableImportProfileIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      const nextProfiles = profiles.filter((profile) => profile.id !== id)
      setProfiles(nextProfiles)

      if (nextProfiles.length === 0) {
        setActiveProfileId('')
      } else if (id === activeProfileId) {
        const nextProfile = nextProfiles[0]
        if (nextProfile) activateProfile(nextProfile)
      }

      return nextProfiles
    },
    [activateProfile, activeProfileId, apiStatus, profiles],
  )

  const deleteAllStoredProfiles = useCallback(async (): Promise<void> => {
    if (apiStatus !== 'sqlite') throw storageUnavailableError()

    try {
      await deleteAllProfiles()
    } catch (error) {
      if (error instanceof ApiAuthenticationError) setApiStatus('authentication_required')
      throw error
    }
    setProfiles([])
    revisionsRef.current.clear()
    setUndoableImportProfileIds(new Set())
    setActiveProfileId('')
  }, [apiStatus])

  const replaceProfiles = useCallback(
    (nextProfiles: FinancialProfile[]): void => {
      setProfiles(nextProfiles)
      const firstProfile = nextProfiles[0]
      if (firstProfile) {
        activateProfile(firstProfile)
      } else {
        setActiveProfileId('')
      }
    },
    [activateProfile],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProfiles(), 0)
    return () => window.clearTimeout(timer)
  }, [loadProfiles])

  const currentProfile = useMemo(
    () => profiles.find((row) => row.id === activeProfileId) ?? profiles[0],
    [activeProfileId, profiles],
  )

  return {
    apiStatus,
    profiles,
    undoableImportProfileIds,
    activeProfileId,
    currentProfile,
    reportingPeriod,
    setReportingPeriod,
    updateReportingPeriod,
    loadProfiles,
    activateProfile,
    selectProfile,
    persistProfile,
    undoLatestImportForProfile,
    deleteStoredProfile,
    deleteAllStoredProfiles,
    replaceProfiles,
  }
}
