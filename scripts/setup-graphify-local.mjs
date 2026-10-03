import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const virtualEnvironment = join(projectDirectory, '.graphify-venv')
const python = process.env.PYTHON ?? 'python3'
const environmentPython = process.platform === 'win32'
  ? join(virtualEnvironment, 'Scripts', 'python.exe')
  : join(virtualEnvironment, 'bin', 'python')
const requirements = join(projectDirectory, 'requirements-graphify.txt')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(`No se pudo ejecutar ${command}: ${result.error.message}`)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(environmentPython)) {
  run(python, ['-m', 'venv', virtualEnvironment])
}

run(environmentPython, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--no-input',
  '--requirement',
  requirements,
])
run(environmentPython, ['-m', 'pip', 'check'])
run(environmentPython, [
  '-c',
  'import graphify; print("Graphify local listo:", graphify.__file__)',
])
