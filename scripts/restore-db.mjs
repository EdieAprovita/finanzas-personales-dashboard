import { resolve, relative } from 'node:path'
import { readBackupSecret, restoreEncryptedBackup } from '../server/recovery.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const inputPath = option('--input')
const keyFile = option('--key-file')
const outputPath = resolve(option('--output') ?? 'data/finanzas-os-restored.sqlite')
if (!inputPath || !keyFile) throw new Error('Uso: npm run restore:db -- --input backup.json --key-file /ruta/privada/clave [--output ruta-nueva.sqlite]')
const resolvedKeyFile = resolve(keyFile)
if (!relative(process.cwd(), resolvedKeyFile).startsWith('..')) throw new Error('El archivo de clave debe estar fuera del repositorio.')

const result = await restoreEncryptedBackup({
  inputPath: resolve(inputPath),
  outputPath,
  secret: await readBackupSecret(resolvedKeyFile),
})
console.log(`Base restaurada y validada: ${result.outputPath}`)
console.log(`SHA-256: ${result.sha256}`)
