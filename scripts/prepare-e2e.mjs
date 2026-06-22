import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const e2eDir = resolve(process.cwd(), '.playwright')

rmSync(e2eDir, { recursive: true, force: true })
mkdirSync(e2eDir, { recursive: true })
