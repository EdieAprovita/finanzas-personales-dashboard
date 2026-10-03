import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const virtualEnvironment = join(projectDirectory, '.graphify-venv')
const graphify = process.platform === 'win32'
  ? join(virtualEnvironment, 'Scripts', 'graphify.exe')
  : join(virtualEnvironment, 'bin', 'graphify')

if (!existsSync(graphify)) {
  console.error('Graphify no está instalado localmente. Ejecuta: npm run graphify:setup')
  process.exit(1)
}

const environmentBin = dirname(graphify)
const result = spawnSync(graphify, process.argv.slice(2), {
  cwd: projectDirectory,
  env: {
    ...process.env,
    PATH: `${environmentBin}${delimiter}${process.env.PATH ?? ''}`,
    VIRTUAL_ENV: virtualEnvironment,
  },
  stdio: 'inherit',
})

if (result.error) {
  throw new Error(`No se pudo ejecutar Graphify: ${result.error.message}`)
}

process.exit(result.status ?? 1)
