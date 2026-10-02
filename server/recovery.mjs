import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

const format = 'finanzas-os-sqlite-backup'
const version = 1
const maxSnapshots = 7
export const MAX_BACKUP_ENVELOPE_BYTES = 256 * 1024 * 1024
const maxBackupKeyBytes = 4096

function checksum(value) {
  return createHash('sha256').update(value).digest('hex')
}

function deriveKey(secret, salt) {
  if (Buffer.byteLength(secret) < 32) throw new Error('La clave de backup debe contener al menos 32 bytes.')
  return scryptSync(secret, salt, 32)
}

export async function readBackupSecret(keyFile) {
  const info = await stat(keyFile)
  if (!info.isFile()) throw new Error('La ruta de clave no es un archivo.')
  if (info.size > maxBackupKeyBytes) throw new Error('El archivo de clave excede el limite permitido.')
  if ((info.mode & 0o077) !== 0) throw new Error('El archivo de clave debe tener permisos 0600.')
  const secret = (await readFile(keyFile, 'utf8')).trim()
  if (Buffer.byteLength(secret) < 32) throw new Error('La clave de backup debe contener al menos 32 bytes.')
  return secret
}

function encryptDatabase(bytes, secret, source) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()])
  return {
    format,
    version,
    createdAt: new Date().toISOString(),
    source,
    sha256: checksum(bytes),
    kdf: { name: 'scrypt', salt: salt.toString('base64') },
    cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
    ciphertext: encrypted.toString('base64'),
  }
}

function decryptDatabase(envelope, secret) {
  const isBase64 = (value) => typeof value === 'string' && value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  if (
    envelope?.format !== format
    || envelope?.version !== version
    || envelope?.kdf?.name !== 'scrypt'
    || envelope?.cipher?.name !== 'aes-256-gcm'
    || !/^[a-f0-9]{64}$/.test(envelope?.sha256 ?? '')
    || !isBase64(envelope?.kdf?.salt)
    || !isBase64(envelope?.cipher?.iv)
    || !isBase64(envelope?.cipher?.tag)
    || !isBase64(envelope?.ciphertext)
  ) {
    throw new Error('El archivo no es un backup compatible.')
  }
  const salt = Buffer.from(envelope.kdf.salt, 'base64')
  const iv = Buffer.from(envelope.cipher.iv, 'base64')
  const tag = Buffer.from(envelope.cipher.tag, 'base64')
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error('Backup incompleto o alterado.')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  decipher.setAuthTag(tag)
  const bytes = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  if (checksum(bytes) !== envelope.sha256) throw new Error('El checksum del backup no coincide.')
  return bytes
}

function validateDatabase(path) {
  const database = new DatabaseSync(path, { readOnly: true, enableForeignKeyConstraints: true })
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all()
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite no supera integrity_check.')
    if (database.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error('SQLite contiene referencias invalidas.')
    const migrations = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => Number(row.version))
    if (!migrations.includes(3)) throw new Error('El backup no contiene el esquema esperado.')
    const profileColumns = database.prepare('PRAGMA table_info(profiles)').all().map((row) => row.name)
    if (!profileColumns.includes('data_json') || !profileColumns.includes('revision')) throw new Error('La tabla de perfiles no tiene el esquema esperado.')
  } finally {
    database.close()
  }
}

async function writePrivate(path, bytes) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
    await chmod(path, 0o600)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function rotateSnapshots(directory, keep = maxSnapshots) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^finanzas-os-.*\.backup\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  await Promise.all(entries.slice(0, Math.max(0, entries.length - keep)).map((name) => rm(join(directory, name))))
}

export async function createEncryptedBackup({ database, sourcePath, outputDirectory, secret, keep = maxSnapshots }) {
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  await chmod(outputDirectory, 0o700)
  const plainPath = join(outputDirectory, `.finanzas-os-${randomUUID()}.sqlite`)
  try {
    await backup(database, plainPath)
    await chmod(plainPath, 0o600)
    validateDatabase(plainPath)
    const bytes = await readFile(plainPath)
    const envelope = encryptDatabase(bytes, secret, basename(sourcePath))
    const verified = decryptDatabase(envelope, secret)
    if (!verified.equals(bytes)) throw new Error('La verificacion del backup no coincide con el snapshot.')
    const stamp = envelope.createdAt.replace(/[:.]/g, '-')
    const outputPath = join(outputDirectory, `finanzas-os-${stamp}.backup.json`)
    await writePrivate(outputPath, `${JSON.stringify(envelope)}\n`)
    await rotateSnapshots(outputDirectory, keep)
    return { outputPath, sha256: envelope.sha256 }
  } finally {
    await rm(plainPath, { force: true })
  }
}

export async function restoreEncryptedBackup({ inputPath, outputPath, secret }) {
  try {
    await stat(outputPath)
    throw new Error('La ruta de restauracion ya existe; elige una ruta nueva.')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const inputInfo = await stat(inputPath)
  if (!inputInfo.isFile() || inputInfo.size > MAX_BACKUP_ENVELOPE_BYTES) {
    throw new Error('El archivo de backup excede el limite permitido.')
  }
  let envelope
  try {
    envelope = JSON.parse(await readFile(inputPath, 'utf8'))
  } catch {
    throw new Error('El archivo de backup no contiene JSON valido.')
  }
  const bytes = decryptDatabase(envelope, secret)
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 })
  const temporary = `${outputPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
    validateDatabase(temporary)
    await rename(temporary, outputPath)
    await chmod(outputPath, 0o600)
    return { outputPath, sha256: envelope.sha256 }
  } finally {
    await rm(temporary, { force: true })
  }
}
