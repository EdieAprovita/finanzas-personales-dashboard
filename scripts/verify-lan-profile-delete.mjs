import { chromium, expect } from '@playwright/test'

const url = process.env.FINANZAS_LAN_URL ?? 'http://192.168.1.90:5193/'
const screenshotPath = process.env.FINANZAS_LAN_SCREENSHOT ?? 'reports/finanzas-lan-desktop-empty-after-delete.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const consoleMessages = []
const pageErrors = []

page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(url)

  const emptyState = page.getByRole('heading', { name: 'Sin perfiles guardados' })
  try {
    await expect(emptyState).toBeVisible({ timeout: 5000 })
    const restore = page.getByRole('button', { name: /Restaurar ejemplos/i })
    await expect(restore).toBeVisible()
    await restore.click()
  } catch {
    // Profiles already exist; continue with the management view assertions.
  }

  await expect(page.locator('[aria-label="Perfiles financieros"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Perfiles financieros' })).toBeVisible()
  await expect(page.locator('.profile-picker')).toHaveCount(0)
  await expect(page.getByLabel('Perfil activo para revisar')).toHaveCount(0)
  await expect(page.locator('.profile-card').first()).toBeVisible()

  await page.getByRole('button', { name: 'Borrar todos los perfiles' }).click()
  await page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' }).click()

  await expect(page.getByRole('heading', { name: 'Sin perfiles guardados' })).toBeVisible()
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toHaveCount(0)
  await expect(page.locator('[aria-label="Perfil activo"]')).toHaveCount(0)
  await expect(page.locator('.profile-card')).toHaveCount(0)
  await expect(page.getByText('Origen no permitido para la API local.')).toHaveCount(0)

  const profilesUrl = new URL('/api/profiles', url).toString()
  const response = await page.request.get(profilesUrl)
  if (!response.ok()) throw new Error(`API profiles respondio ${response.status()}`)
  const body = await response.json()
  if (body.profiles.length !== 0) throw new Error(`SQLite conserva ${body.profiles.length} perfil(es)`)

  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        profiles: body.profiles.length,
        screenshotPath,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        url,
        error: error instanceof Error ? error.message : String(error),
        consoleMessages,
        pageErrors,
        bodyText: await page.locator('body').innerText().catch(() => ''),
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser.close()
}
