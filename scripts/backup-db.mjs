import { resolve, dirname, relative } from 'node:path'
import { createEncryptedBackup, readBackupSecret } from '../server/recovery.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const keyFile = option('--key-file')
if (!keyFile) throw new Error('Uso: npm run backup:db -- --key-file /ruta/privada/clave [--output-dir /ruta/backups]')
const resolvedKeyFile = resolve(keyFile)
if (!relative(process.cwd(), resolvedKeyFile).startsWith('..')) throw new Error('El archivo de clave debe estar fuera del repositorio.')

const { database, dbPath } = await import('../server/db.mjs')
const outputDirectory = resolve(option('--output-dir') ?? resolve(dirname(dbPath), 'backups'))
const result = await createEncryptedBackup({
  database,
  sourcePath: dbPath,
  outputDirectory,
  secret: await readBackupSecret(resolvedKeyFile),
})
database.close()
console.log(`Backup cifrado: ${result.outputPath}`)
console.log(`SHA-256: ${result.sha256}`)
