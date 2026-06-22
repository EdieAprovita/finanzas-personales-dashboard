import Dexie, { type EntityTable } from 'dexie'
import type { FinancialProfile } from '../domain/types'
import { exampleProfiles } from '../domain/exampleData'

export const db = new Dexie('finanzas-personales-local') as Dexie & {
  profiles: EntityTable<FinancialProfile, 'id'>
}

db.version(1).stores({
  profiles: 'id, name',
})

export async function seedProfiles(force = false) {
  const count = await db.profiles.count()
  if (force || count === 0) {
    await db.transaction('rw', db.profiles, async () => {
      await db.profiles.clear()
      await db.profiles.bulkPut(exampleProfiles)
    })
  }
}
