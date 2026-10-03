import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js')

if (!existsSync(viteEntry)) {
  throw new Error('Vite no está instalado. Ejecuta npm install antes de npm run dev.')
}

const children = []
let isShuttingDown = false
let shutdownExitCode = 0

function finishWhenChildrenExit() {
  if (!isShuttingDown) return
  const allExited = children.every((child) => child.exitCode !== null || child.signalCode !== null)
  if (allExited) process.exitCode = shutdownExitCode
}

function stopAll(exitCode) {
  if (isShuttingDown) return
  isShuttingDown = true
  shutdownExitCode = exitCode
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  finishWhenChildrenExit()
  setTimeout(() => process.exit(shutdownExitCode), 2000)
}

function start(command, args, name) {
  const child = spawn(command, args, {
    cwd: projectDirectory,
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)
  child.once('error', (error) => {
    console.error(`[dev] ${name} no pudo iniciar: ${error.message}`)
    stopAll(1)
  })
  child.once('exit', (code, signal) => {
    if (isShuttingDown) {
      finishWhenChildrenExit()
      return
    }
    const exitCode = code ?? (signal ? 1 : 0)
    if (exitCode !== 0) console.error(`[dev] ${name} terminó con código ${exitCode}`)
    stopAll(exitCode)
  })
}

process.once('SIGINT', () => stopAll(0))
process.once('SIGTERM', () => stopAll(0))

start(process.execPath, ['server/index.mjs'], 'API')
start(process.execPath, [viteEntry, ...process.argv.slice(2)], 'Vite')
