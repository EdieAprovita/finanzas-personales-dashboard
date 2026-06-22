import { chromium, expect } from '@playwright/test'

const url = process.env.FINANZAS_LAN_URL ?? 'http://192.168.1.90:5173/'
const screenshotPath = process.env.FINANZAS_LAN_SCREENSHOT ?? 'reports/finanzas-real-lan-desktop-profiles-fixed.png'
const viewport = {
  width: Number(process.env.FINANZAS_VIEWPORT_WIDTH ?? 1440),
  height: Number(process.env.FINANZAS_VIEWPORT_HEIGHT ?? 1000),
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport })
const consoleMessages = []
const pageErrors = []

page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(url)

  const profileStrip = page.locator('[aria-label="Perfiles financieros"]')
  const emptyState = page.getByRole('heading', { name: 'Empieza limpio, con datos por perfil' })
  await expect(profileStrip.or(emptyState)).toBeVisible()

  const profilesUrl = new URL('/api/profiles', url).toString()
  const response = await page.request.get(profilesUrl)
  if (!response.ok()) throw new Error(`API profiles respondio ${response.status()}`)
  const body = await response.json()

  await expect(page.getByText('Origen no permitido para la API local.')).toHaveCount(0)

  if (await profileStrip.isVisible()) {
    await expect(page.getByRole('heading', { name: 'Perfiles financieros' })).toBeVisible()
    await expect(page.locator('.profile-picker')).toHaveCount(0)
    await expect(page.getByLabel('Perfil activo para revisar')).toHaveCount(0)
    await expect(page.locator('.profile-card').first()).toBeVisible()
  }

  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        profiles: body.profiles.length,
        view: (await profileStrip.isVisible()) ? 'profiles' : 'empty',
        viewport,
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
