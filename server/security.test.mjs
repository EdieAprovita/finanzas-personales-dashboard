import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const token = 'synthetic-security-test-token-00001'

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

for (const lanMode of ['0', '1']) {
  test(`API enforces authentication in mode ${lanMode}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'finanzas-auth-test-'))
    const port = await freePort()
    const base = `http://127.0.0.1:${port}`
    const child = spawn(process.execPath, ['server/index.mjs'], {
      env: { ...process.env, FINANZAS_DB_PATH: join(directory, 'synthetic.sqlite'), FINANZAS_API_PORT: String(port), FINANZAS_LAN_MODE: lanMode, FINANZAS_API_TOKEN: token },
      stdio: 'ignore',
    })
    try {
      let ready = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) throw new Error('API exited before readiness')
        try { ready = (await fetch(`${base}/api/health`)).ok } catch { /* wait for startup */ }
        if (ready) break
        await delay(50)
      }
      assert.ok(ready)
      const health = await fetch(`${base}/api/health`)
      assert.equal((await health.json()).authRequired, true)
      const origin = 'http://localhost:5173'
      for (const [method, path] of [
        ['GET', '/api/profiles'], ['PUT', '/api/profiles/synthetic'], ['DELETE', '/api/profiles'],
        ['DELETE', '/api/profiles/synthetic'], ['GET', '/api/profiles/synthetic/documents'],
        ['GET', '/api/profiles/synthetic/reconciliation'], ['GET', '/api/profiles/synthetic/transaction-amounts'],
        ['GET', '/api/knowledge'], ['POST', '/api/knowledge/explain'],
      ]) {
        for (const headers of [{}, { origin }, { origin, authorization: 'Bearer wrong' }, { origin, authorization: `Bearer ${token}x` }]) {
          const response = await fetch(`${base}${path}`, { method, headers })
          assert.equal(response.status, 401, `${method} ${path}`)
        }
      }
      for (const headers of [{ authorization: `Bearer ${token}` }, { origin, authorization: `Bearer ${token}` }]) {
        const response = await fetch(`${base}/api/profiles`, { headers })
        assert.equal(response.status, 200)
        assert.deepEqual((await response.json()).profiles, [])
      }
      const disallowed = await fetch(`${base}/api/profiles`, { headers: { origin: 'https://attacker.example', authorization: `Bearer ${token}` } })
      assert.equal(disallowed.status, 403)
      const preflight = await fetch(`${base}/api/profiles`, { method: 'OPTIONS', headers: { origin, 'access-control-request-headers': 'authorization' } })
      assert.equal(preflight.status, 204)
      assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/)
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve))
        child.kill('SIGTERM')
        await exited
      }
      await rm(directory, { recursive: true, force: true })
    }
  })
}
