export const DOCUMENTS_STORAGE_VERSION = 1

export function serializeProfileWithoutDocuments(profile) {
  return JSON.stringify({
    ...profile,
    importedDocuments: [],
    _documentPayloadCount: profile.importedDocuments.length,
  })
}

export function hydrateProfileDocuments(database, row) {
  const { _documentPayloadCount, ...profile } = JSON.parse(row.data_json)
  if (Number(row.documents_storage_version ?? 0) === 0) return profile
  if (Number(row.documents_storage_version) !== DOCUMENTS_STORAGE_VERSION || !Number.isSafeInteger(_documentPayloadCount)) {
    throw new Error('El manifiesto de documentos del perfil no es valido.')
  }

  const payloadRows = database
    .prepare(`
      SELECT position, document_id, payload_json
      FROM profile_document_payloads
      WHERE profile_id = ?
      ORDER BY position
    `)
    .all(row.id ?? profile.id)
  if (payloadRows.length !== _documentPayloadCount) {
    throw new Error('Los documentos del perfil estan incompletos.')
  }
  const importedDocuments = payloadRows.map((payloadRow, position) => {
    const document = JSON.parse(payloadRow.payload_json)
    if (Number(payloadRow.position) !== position || document?.id !== payloadRow.document_id) {
      throw new Error('Los documentos del perfil no superan la verificacion de integridad.')
    }
    return document
  })

  return { ...profile, importedDocuments }
}

export function syncProfileDocumentPayloads(database, profile) {
  const documents = Array.isArray(profile.importedDocuments) ? profile.importedDocuments : []
  let changes = Number(
    database.prepare('DELETE FROM profile_document_payloads WHERE profile_id = ? AND position >= ?')
      .run(profile.id, documents.length).changes,
  )
  const upsert = database.prepare(`
    INSERT INTO profile_document_payloads
      (profile_id, position, document_id, payload_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id, position) DO UPDATE SET
      document_id = excluded.document_id,
      payload_json = excluded.payload_json,
      revision = profile_document_payloads.revision + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE profile_document_payloads.document_id <> excluded.document_id
       OR profile_document_payloads.payload_json <> excluded.payload_json
  `)

  for (const [position, document] of documents.entries()) {
    changes += Number(upsert.run(profile.id, position, document.id, JSON.stringify(document)).changes)
  }
  return changes
}
