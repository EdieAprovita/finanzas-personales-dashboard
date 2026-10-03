import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'

const token = 'synthetic-concurrency-token-0000001'

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

function profile(name) {
  return {
    schemaVersion: 2,
    reportingCurrency: 'MXN',
    id: 'synthetic-conflict-profile',
    name,
    description: '',
    grossMonthlyIncome: 0,
    netMonthlyIncome: 0,
    accounts: [],
    transactions: [],
    debts: [],
    goals: [],
    budgets: [],
    monthlySnapshots: [],
    importedDocuments: [],
    investmentPositions: [],
  }
}

function withDocument(value, summary) {
  return {
    ...value,
    importedDocuments: [{
      id: 'synthetic-document',
      fileName: 'synthetic.csv',
      fileType: 'csv',
      importedAt: '2026-10-02T12:00:00.000Z',
      status: 'processed',
      summary,
      extractedRows: 1,
    }],
  }
}

function documentPayloadRevision(path) {
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    return Number(database.prepare(`
      SELECT revision
      FROM profile_document_payloads
      WHERE profile_id = ? AND position = 0
    `).get('synthetic-conflict-profile')?.revision ?? 0)
  } finally {
    database.close()
  }
}

test('profile revisions prevent stale writes and deletes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finanzas-concurrency-test-'))
  const databasePath = join(directory, 'synthetic.sqlite')
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.mjs'], {
    env: {
      ...process.env,
      FINANZAS_DB_PATH: databasePath,
      FINANZAS_API_PORT: String(port),
      FINANZAS_API_TOKEN: token,
      FINANZAS_MAX_PROFILE_BYTES: String(2 * 1024 * 1024),
    },
    stdio: 'ignore',
  })
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error('API exited before readiness')
      try {
        ready = (await fetch(`${base}/api/health`)).ok
      } catch {
        // Wait for startup.
      }
      if (ready) break
      await delay(50)
    }
    assert.ok(ready)

    const create = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers: { ...headers, 'if-none-match': '*' },
      body: JSON.stringify(profile('Inicial')),
    })
    assert.equal(create.status, 200)
    assert.equal(create.headers.get('etag'), '"profile-1"')
    assert.equal((await create.json()).revision, 1)

    const beforeImport = withDocument(profile('Guardado A'), 'Documento anterior')
    const firstWrite = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers: { ...headers, 'if-match': '"profile-1"' },
      body: JSON.stringify(beforeImport),
    })
    assert.equal(firstWrite.status, 200)
    assert.equal(firstWrite.headers.get('etag'), '"profile-2"')
    assert.equal(documentPayloadRevision(databasePath), 1)

    const staleWrite = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers: { ...headers, 'if-match': '"profile-1"' },
      body: JSON.stringify(profile('Guardado obsoleto B')),
    })
    assert.equal(staleWrite.status, 409)
    assert.equal((await staleWrite.json()).code, 'PROFILE_CONFLICT')

    const missingPrecondition = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(profile('Sin precondicion')),
    })
    assert.equal(missingPrecondition.status, 428)

    const stored = await fetch(`${base}/api/profiles`, { headers })
    const storedBody = await stored.json()
    assert.equal(storedBody.profiles[0].name, 'Guardado A')
    assert.equal(storedBody.revisions['synthetic-conflict-profile'], 2)

    const imported = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers: { ...headers, 'if-match': '"profile-2"', 'x-finanzas-operation': 'import_batch' },
      body: JSON.stringify(withDocument(profile('Importado'), 'Documento importado')),
    })
    assert.equal(imported.status, 200)
    assert.equal((await imported.json()).revision, 3)
    assert.equal(documentPayloadRevision(databasePath), 2)
    const withUndo = await fetch(`${base}/api/profiles`, { headers })
    assert.equal((await withUndo.json()).importUndos['synthetic-conflict-profile'].revision, 3)

    const undo = await fetch(`${base}/api/profiles/synthetic-conflict-profile/import-undo`, {
      method: 'POST',
      headers: { ...headers, 'if-match': '"profile-3"' },
    })
    assert.equal(undo.status, 200)
    assert.equal((await undo.json()).revision, 4)
    const afterUndo = await fetch(`${base}/api/profiles`, { headers })
    const afterUndoBody = await afterUndo.json()
    assert.equal(afterUndoBody.profiles[0].name, 'Guardado A')
    assert.deepEqual(afterUndoBody.profiles[0].importedDocuments, beforeImport.importedDocuments)
    assert.equal(documentPayloadRevision(databasePath), 3)
    assert.equal(afterUndoBody.importUndos['synthetic-conflict-profile'], undefined)

    const staleDelete = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'DELETE',
      headers: { ...headers, 'if-match': '"profile-1"' },
    })
    assert.equal(staleDelete.status, 409)

    const currentDelete = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'DELETE',
      headers: { ...headers, 'if-match': '"profile-4"' },
    })
    assert.equal(currentDelete.status, 200)

    const staleRecreate = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers: { ...headers, 'if-match': '"profile-4"' },
      body: JSON.stringify(profile('No debe reaparecer')),
    })
    assert.equal(staleRecreate.status, 409)

    const importedNewProfile = { ...profile('Creado por importacion'), id: 'synthetic-import-created' }
    const createImported = await fetch(`${base}/api/profiles/synthetic-import-created`, {
      method: 'PUT',
      headers: { ...headers, 'if-none-match': '*', 'x-finanzas-operation': 'import_batch' },
      body: JSON.stringify(importedNewProfile),
    })
    assert.equal(createImported.status, 200)
    const undoCreated = await fetch(`${base}/api/profiles/synthetic-import-created/import-undo`, {
      method: 'POST',
      headers: { ...headers, 'if-match': '"profile-1"' },
    })
    assert.equal(undoCreated.status, 200)
    assert.equal((await undoCreated.json()).deleted, true)
    const afterUndoCreated = await fetch(`${base}/api/profiles`, { headers })
    const afterUndoCreatedBody = await afterUndoCreated.json()
    assert.equal(afterUndoCreatedBody.profiles.some((row) => row.id === importedNewProfile.id), false)
    assert.equal(afterUndoCreatedBody.importUndos[importedNewProfile.id], undefined)

    const oversized = await fetch(`${base}/api/profiles/synthetic-conflict-profile`, {
      method: 'PUT',
      headers: { ...headers, 'if-none-match': '*' },
      body: JSON.stringify({ ...profile('Grande'), padding: 'x'.repeat(2 * 1024 * 1024) }),
    })
    assert.equal(oversized.status, 413)
    const afterOversized = await fetch(`${base}/api/profiles`, { headers })
    assert.deepEqual((await afterOversized.json()).profiles, [])

    const collectionProfiles = [
      { ...profile('Coleccion A'), id: 'collection-a' },
      { ...profile('Coleccion B'), id: 'collection-b' },
    ]
    for (const candidate of collectionProfiles) {
      const response = await fetch(`${base}/api/profiles/${candidate.id}`, {
        method: 'PUT',
        headers: { ...headers, 'if-none-match': '*' },
        body: JSON.stringify(candidate),
      })
      assert.equal(response.status, 200)
    }

    const staleCollection = await fetch(`${base}/api/profiles`, { headers })
    const staleCollectionBody = await staleCollection.json()
    assert.match(staleCollectionBody.collectionEtag, /^"profiles-[a-f0-9]{64}"$/)

    const collectionUpdate = await fetch(`${base}/api/profiles/collection-a`, {
      method: 'PUT',
      headers: { ...headers, 'if-match': '"profile-1"' },
      body: JSON.stringify({ ...collectionProfiles[0], name: 'Coleccion A actualizada' }),
    })
    assert.equal(collectionUpdate.status, 200)

    const deleteWithoutPrecondition = await fetch(`${base}/api/profiles`, { method: 'DELETE', headers })
    assert.equal(deleteWithoutPrecondition.status, 428)

    const staleCollectionDelete = await fetch(`${base}/api/profiles`, {
      method: 'DELETE',
      headers: { ...headers, 'if-match': staleCollectionBody.collectionEtag },
    })
    assert.equal(staleCollectionDelete.status, 409)
    assert.equal((await staleCollectionDelete.json()).code, 'PROFILE_COLLECTION_CONFLICT')

    const freshCollection = await fetch(`${base}/api/profiles`, { headers })
    const freshCollectionBody = await freshCollection.json()
    assert.equal(freshCollectionBody.profiles.length, 2)
    assert.equal(freshCollectionBody.profiles.find((row) => row.id === 'collection-a').name, 'Coleccion A actualizada')

    const abaDelete = await fetch(`${base}/api/profiles/collection-b`, {
      method: 'DELETE',
      headers: { ...headers, 'if-match': '"profile-1"' },
    })
    assert.equal(abaDelete.status, 200)
    const abaRecreate = await fetch(`${base}/api/profiles/collection-b`, {
      method: 'PUT',
      headers: { ...headers, 'if-none-match': '*' },
      body: JSON.stringify(collectionProfiles[1]),
    })
    assert.equal(abaRecreate.status, 200)
    const abaCollectionDelete = await fetch(`${base}/api/profiles`, {
      method: 'DELETE',
      headers: { ...headers, 'if-match': freshCollectionBody.collectionEtag },
    })
    assert.equal(abaCollectionDelete.status, 409)

    const refreshedCollection = await fetch(`${base}/api/profiles`, { headers })
    const refreshedCollectionBody = await refreshedCollection.json()

    const freshCollectionDelete = await fetch(`${base}/api/profiles`, {
      method: 'DELETE',
      headers: { ...headers, 'if-match': refreshedCollectionBody.collectionEtag },
    })
    assert.equal(freshCollectionDelete.status, 200)
    assert.equal((await freshCollectionDelete.json()).deletedCount, 2)
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((resolve) => child.once('exit', resolve))
    }
    await rm(directory, { recursive: true, force: true })
  }
})
