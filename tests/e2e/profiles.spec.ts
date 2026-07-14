import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { exampleProfiles } from '../../src/domain/exampleData'
import type { FinancialProfile } from '../../src/domain/types'
import { generateSyntheticDocumentFixtures } from '../../scripts/lib/synthetic-document-fixtures.mjs'

async function restoreExamples(page: Page) {
  const restore = page.getByRole('button', { name: /Restaurar ejemplos/i })
  await expect(restore).toBeVisible()
  await restore.click()
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toBeVisible()
}

async function seedExampleProfiles(page: Page) {
  const deleteResponse = await page.request.delete('/api/profiles')
  expect(deleteResponse.ok()).toBe(true)

  for (const profile of exampleProfiles) {
    const response = await page.request.put(`/api/profiles/${encodeURIComponent(profile.id)}`, {
      data: profile,
    })
    expect(response.ok()).toBe(true)
  }
}

async function resetProfilesToExamples(page: Page) {
  await seedExampleProfiles(page)
  await page.goto('/')

  const profileStrip = page.locator('[aria-label="Perfiles financieros"]')
  if (!(await profileStrip.isVisible().catch(() => false))) {
    const backToProfiles = page.getByRole('button', { name: /Ver perfiles/i })
    if (await backToProfiles.isVisible().catch(() => false)) await backToProfiles.click()
  }
  await expect(profileStrip).toBeVisible()
}

async function expectNoProfilesOrDashboard(page: Page) {
  await expect(page.getByRole('heading', { name: 'Empieza con tu información financiera' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Crea tu primer espacio financiero' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear espacio' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restaurar ejemplos' })).toBeVisible()
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toHaveCount(0)
  await expect(page.locator('[aria-label="Perfil activo"]')).toHaveCount(0)
  await expect(page.locator('[aria-label="Navegacion principal"]')).toHaveCount(0)
  await expect(page.locator('.kpi', { hasText: 'Score Finanzas OS' })).toHaveCount(0)
  await expect(page.getByText('Ahorro saludable')).toHaveCount(0)
  await expect(page.getByText('Metas grandes')).toHaveCount(0)
  await expect(page.locator('.profile-card')).toHaveCount(0)
  const profilesResponse = await page.request.get('/api/profiles')
  expect(profilesResponse.ok()).toBe(true)
  const body = (await profilesResponse.json()) as { profiles: unknown[] }
  expect(body.profiles).toHaveLength(0)
}

async function putStaleLocalProfile(page: Page) {
  await page.evaluate(async (profile) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('finanzas-personales-local-stale', 1)

      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'))
      request.onupgradeneeded = () => {
        request.result.createObjectStore('profiles', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('profiles', 'readwrite')
        const store = transaction.objectStore('profiles')

        store.put(profile)
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => {
          database.close()
          reject(transaction.error ?? new Error('No se pudo escribir el perfil local stale.'))
        }
      }
    })
  }, exampleProfiles[0])
}

async function createCleanProfileForImports(page: Page, name: string) {
  await page.getByRole('button', { name: 'Borrar todos los perfiles' }).click()
  await page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' }).click()
  await expectNoProfilesOrDashboard(page)
  await page.getByRole('button', { name: 'Crear espacio' }).click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await dialog.getByLabel('Nombre del perfil').fill(name)
  await dialog.getByRole('button', { name: /Crear y capturar datos/i }).click()
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText(name)
  await page.locator('nav').getByRole('button', { name: 'Documentos' }).click()
}

function payrollCfdiXml(total: number, paymentDate: string) {
  const subtotal = total + 6200
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="${paymentDate}" Total="${total.toFixed(2)}" SubTotal="${subtotal.toFixed(2)}">
  <cfdi:Emisor Nombre="EMPRESA E2E SA DE CV" Rfc="AAA010101AAA" />
  <cfdi:Receptor Nombre="PERSONA E2E" Rfc="XAXX010101000" />
  <cfdi:Complemento>
    <nomina12:Nomina Version="1.2" TipoNomina="O" FechaPago="${paymentDate}" FechaInicialPago="2026-06-01" FechaFinalPago="${paymentDate}" NumDiasPagados="15.000" TotalPercepciones="${subtotal.toFixed(2)}" TotalDeducciones="6200.00" TotalOtrosPagos="0.00">
      <nomina12:Emisor RegistroPatronal="Y1234567890" />
      <nomina12:Receptor Curp="XAXX010101HDFXXX00" NumSeguridadSocial="12345678901" NumEmpleado="EMP-12345" TipoContrato="01" TipoJornada="01" TipoRegimen="02" RiesgoPuesto="2" PeriodicidadPago="04" Banco="012" CuentaBancaria="123456789012345678" SalarioBaseCotApor="1600.00" SalarioDiarioIntegrado="1700.00" ClaveEntFed="CMX" />
      <nomina12:Percepciones TotalSueldos="${subtotal.toFixed(2)}" TotalGravado="${subtotal.toFixed(2)}" TotalExento="0.00"><nomina12:Percepcion TipoPercepcion="001" Clave="P001" Concepto="Sueldo" ImporteGravado="${subtotal.toFixed(2)}" ImporteExento="0.00" /></nomina12:Percepciones>
      <nomina12:Deducciones TotalOtrasDeducciones="200.00" TotalImpuestosRetenidos="6000.00">
        <nomina12:Deduccion TipoDeduccion="002" Clave="D001" Concepto="ISR" Importe="6000.00" />
        <nomina12:Deduccion TipoDeduccion="001" Clave="D002" Concepto="IMSS" Importe="200.00" />
      </nomina12:Deducciones>
    </nomina12:Nomina>
    <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-666666666666" />
  </cfdi:Complemento>
</cfdi:Comprobante>`
}

test.beforeEach(async ({ page }) => {
  await resetProfilesToExamples(page)
})

test('opens a profile dashboard as a distinct view', async ({ page }) => {
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar todos los perfiles' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tus espacios financieros' })).toBeVisible()
  await expect(page.locator('.profile-picker')).toHaveCount(0)
  await expect(page.getByLabel('Perfil activo para revisar')).toHaveCount(0)

  const profileCard = page.locator('.profile-card', { hasText: 'Ahorro saludable' })
  await profileCard.getByRole('button', { name: /Abrir resumen/i }).click()

  await expect(page.locator('[aria-label="Perfiles financieros"]')).toHaveCount(0)
  await expect(page.locator('[aria-label="Perfil activo"]')).toBeVisible()
  await expect(page.locator('.kpi', { hasText: 'Score Finanzas OS' })).toBeVisible()

  await page.getByRole('button', { name: /Ver perfiles/i }).click()
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toBeVisible()
})

test('opens the selected profile dashboard from profile management', async ({ page }) => {
  const profileCard = page.locator('.profile-card', { hasText: 'Metas grandes' })
  await expect(profileCard).toBeVisible()
  await profileCard.getByRole('button', { name: /Abrir resumen/i }).click()

  await expect(page.locator('[aria-label="Perfiles financieros"]')).toHaveCount(0)
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('Metas grandes')
  await expect(page.locator('.kpi', { hasText: 'Score Finanzas OS' })).toBeVisible()
})

test('restores an example only from its dashboard and confirms the result', async ({ page }) => {
  const modifiedExample = {
    ...exampleProfiles[0],
    description: 'Descripción modificada para probar restauración.',
    accounts: [],
    transactions: [],
  }
  const updateResponse = await page.request.put(`/api/profiles/${encodeURIComponent(modifiedExample.id)}`, { data: modifiedExample })
  expect(updateResponse.ok()).toBe(true)
  await page.goto('/')

  const profileCard = page.locator('.profile-card', { hasText: 'Ahorro saludable' })
  await profileCard.getByRole('button', { name: /Abrir resumen/i }).click()
  const activeProfile = page.locator('[aria-label="Perfil activo"]')
  await expect(activeProfile.getByRole('button', { name: 'Restaurar demo' })).toBeVisible()
  await activeProfile.getByRole('button', { name: 'Restaurar demo' }).click()
  await expect(page.getByText('Datos de ejemplo restaurados para este espacio.')).toBeVisible()

  const profilesResponse = await page.request.get('/api/profiles')
  const body = (await profilesResponse.json()) as { profiles: FinancialProfile[] }
  const restored = body.profiles.find((profile) => profile.id === exampleProfiles[0].id)
  expect(restored?.accounts).toEqual(exampleProfiles[0].accounts)
  expect(restored?.transactions).toEqual(exampleProfiles[0].transactions)
})

test('switches the financial history range from dashboard controls', async ({ page }) => {
  const profileCard = page.locator('.profile-card', { hasText: 'Ahorro saludable' })
  await profileCard.getByRole('button', { name: /Abrir resumen/i }).click()

  const rangeControls = page.getByRole('group', { name: 'Rango del historial financiero' })
  const recent = rangeControls.getByRole('button', { name: 'Ultimos 6 meses' })
  const allHistory = rangeControls.getByRole('button', { name: 'Todo el historial' })
  await expect(recent).toHaveAttribute('aria-pressed', 'true')
  await allHistory.click()
  await expect(allHistory).toHaveAttribute('aria-pressed', 'true')
  await expect(recent).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/Proyeccion descriptiva:/i)).toBeVisible()
})

test('deletes all profiles quickly with a two-step confirmation and restores examples', async ({ page }) => {
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toBeVisible()
  await page.locator('.profile-card', { hasText: 'Ahorro saludable' }).getByRole('button', { name: /Abrir resumen/i }).click()
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('Ahorro saludable')
  await page.getByRole('button', { name: 'Ver perfiles' }).click()

  await page.getByRole('button', { name: 'Borrar todos los perfiles' }).click()
  await expect(page.getByText(/Confirma para eliminar \d+ perfil/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' })).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' }).click()
  await expectNoProfilesOrDashboard(page)
  await page.reload()
  await expectNoProfilesOrDashboard(page)
  await expect(page.getByRole('button', { name: 'Crear espacio' })).toBeVisible()

  await restoreExamples(page)
  await expect(page.getByText(/Perfiles de ejemplo restaurados/i)).toBeVisible()
})

test('blocks the workspace instead of rehydrating IndexedDB when SQLite is unavailable', async ({ page }) => {
  await page.getByRole('button', { name: 'Borrar todos los perfiles' }).click()
  await page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' }).click()
  await expectNoProfilesOrDashboard(page)

  await putStaleLocalProfile(page)
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'api unavailable during fallback test' }),
    })
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'No se pudo abrir tu información financiera' })).toBeVisible()
  await expect(page.getByText('Ahorro saludable')).toHaveCount(0)
})

test('rejects malformed, oversized, and non-local API requests', async ({ page }) => {
  const invalidProfile = await page.request.put('/api/profiles/invalid', {
    data: { id: 'invalid', name: 'Perfil incompleto' },
  })
  expect(invalidProfile.status()).toBe(400)

  const rejectedOrigin = await page.request.get('/api/health', {
    headers: { origin: 'http://untrusted.example' },
  })
  expect(rejectedOrigin.status()).toBe(403)

  const oversizedPayload = await page.request.post('/api/knowledge/explain', {
    data: { text: 'x'.repeat(2 * 1024 * 1024) },
  })
  expect(oversizedPayload.status()).toBe(413)
})

test('creates a profile and deletes it individually with confirmation', async ({ page }) => {
  await page.getByRole('button', { name: /Nuevo espacio/i }).first().click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await dialog.getByLabel('Nombre del perfil').fill('E2E Perfil borrable')
  await dialog.getByLabel('Descripcion', { exact: true }).fill('Perfil sintetico para validar borrado individual.')
  await dialog.getByRole('button', { name: /Crear y capturar datos/i }).click()

  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('E2E Perfil borrable')
  await page.getByRole('button', { name: 'Ver perfiles' }).click()

  const createdProfileCard = page.locator('.profile-card', { hasText: 'E2E Perfil borrable' })
  await expect(createdProfileCard).toBeVisible()
  await createdProfileCard.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText(/Confirma para eliminar E2E Perfil borrable/i)).toBeVisible()
  await createdProfileCard.getByRole('button', { name: 'Confirmar eliminar' }).click()

  await expect(createdProfileCard).toHaveCount(0)
  await expect(page.getByText(/E2E Perfil borrable fue eliminado/i)).toBeVisible()
  await page.reload()
  await expect(page.getByText('E2E Perfil borrable')).toHaveCount(0)
})

test('deletes the last profile individually and shows the empty state', async ({ page }) => {
  await page.getByRole('button', { name: 'Borrar todos los perfiles' }).click()
  await page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' }).click()
  await expect(page.getByRole('heading', { name: 'Empieza con tu información financiera' })).toBeVisible()

  await page.getByRole('button', { name: 'Crear espacio' }).click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await dialog.getByLabel('Nombre del perfil').fill('E2E Perfil unico')
  await dialog.getByRole('button', { name: /Crear y capturar datos/i }).click()
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('E2E Perfil unico')

  await page.getByRole('button', { name: 'Ver perfiles' }).click()
  const onlyProfileCard = page.locator('.profile-card', { hasText: 'E2E Perfil unico' })
  await onlyProfileCard.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText(/Confirma para eliminar E2E Perfil unico/i)).toBeVisible()
  await onlyProfileCard.getByRole('button', { name: 'Confirmar eliminar' }).click()

  await expectNoProfilesOrDashboard(page)
  await expect(page.getByText(/E2E Perfil unico fue eliminado/i)).toBeVisible()
  await page.reload()
  await expectNoProfilesOrDashboard(page)
})

test('shows and navigates the empty desktop dashboard for a real profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Smoke desktop-only para el dashboard vacio.')

  await page.getByRole('button', { name: 'Borrar todos los perfiles' }).click()
  await page.getByRole('button', { name: 'Confirmar borrar todos los perfiles' }).click()
  await expectNoProfilesOrDashboard(page)

  await page.getByRole('button', { name: 'Crear espacio' }).click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await dialog.getByLabel('Nombre del perfil').fill('E2E Perfil vacio desktop')
  await dialog.getByRole('button', { name: /Crear y capturar datos/i }).click()

  await expect(page.locator('[aria-label="Navegacion principal"]')).toBeVisible()
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('E2E Perfil vacio desktop')

  await page.getByRole('button', { name: 'Resumen' }).click()

  const emptyDashboard = page.locator('.empty-dashboard-grid')
  await expect(page.getByRole('heading', { name: 'Resumen financiero' })).toBeVisible()
  await expect(emptyDashboard).toBeVisible()
  await expect(emptyDashboard.getByText('Perfil activo sin datos')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activa el dashboard financiero de este perfil' })).toBeVisible()
  await expect(page.locator('[aria-label="Estado base del perfil"]')).toContainText('0')
  await expect(page.locator('[aria-label="Estado base del perfil"]')).toContainText('cuentas')
  await expect(page.locator('[aria-label="Estado base del perfil"]')).toContainText('documentos')
  await expect(page.locator('[aria-label="Preparacion del dashboard"]')).toContainText('Información organizada')
  await expect(page.locator('[aria-label="Vista previa profesional del dashboard sin datos"]')).toContainText('Preview operativo')
  await expect(page.locator('[aria-label="Preparacion 0 por ciento"]')).toContainText('0%')
  await expect(page.locator('[aria-label="Indicadores pendientes"]')).toContainText('Score Finanzas OS')
  await expect(page.locator('[aria-label="Paneles pendientes"]')).toContainText('Datos locales por perfil')
  await expect(page.locator('.kpi')).toHaveCount(0)
  await expect(page.locator('[aria-label="Perfiles financieros"]')).toHaveCount(0)

  await emptyDashboard.getByRole('button', { name: 'Capturar primer dato' }).click()
  await expect(page.getByRole('heading', { name: 'Crear meta' })).toBeVisible()

  await page.getByRole('button', { name: 'Resumen' }).click()
  await emptyDashboard.getByRole('button', { name: 'Importar documentos' }).click()
  await expect(page.getByRole('heading', { name: 'Ingreso de documentos' })).toBeVisible()

  await page.getByRole('button', { name: 'Resumen' }).click()
  await emptyDashboard.getByRole('button', { name: 'Crear primera meta' }).click()
  await expect(page.getByRole('heading', { name: 'Metas y planeacion' })).toBeVisible()
})

test('creates a manual profile and captures an account plus movement', async ({ page }) => {
  await page.getByRole('button', { name: /Nuevo espacio/i }).first().click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nombre del perfil').fill('E2E Perfil captura')
  await dialog.getByLabel('Descripcion', { exact: true }).fill('Perfil sintetico para probar captura manual.')
  await dialog.getByRole('button', { name: /Crear y capturar datos/i }).click()

  await expect(page.getByRole('heading', { name: 'Crear meta' })).toBeVisible()
  const accountPanel = page.locator('.capture-card').filter({ has: page.getByRole('heading', { name: 'Agregar cuenta o deuda' }) })
  await accountPanel.getByLabel('Nombre').fill('E2E Cuenta Nomina')
  await accountPanel.getByLabel('Saldo actual').fill('25000')
  await accountPanel.getByRole('button', { name: /Agregar cuenta/i }).click()
  await expect(accountPanel.getByLabel('Nombre')).toBeEmpty()

  const movementPanel = page.locator('.capture-card').filter({ has: page.getByRole('heading', { name: 'Registrar movimiento' }) })
  await movementPanel.getByLabel('Monto').fill('1200')
  await movementPanel.getByLabel('Comercio / origen').fill('E2E Supermercado')
  await movementPanel.getByLabel('Categoría').fill('Supermercado')
  await movementPanel.getByRole('button', { name: /Guardar movimiento/i }).click()

  await page.getByRole('button', { name: 'Resumen' }).click()
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('E2E Perfil captura')
  await expect(page.locator('.kpi', { hasText: 'Score Finanzas OS' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restaurar demo' })).toHaveCount(0)

  await page.locator('nav').getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByRole('heading', { name: 'Crear meta' })).toBeVisible()
  await page.getByRole('button', { name: 'Resumen' }).click()
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('E2E Perfil captura')
  await expect(page.locator('.kpi', { hasText: 'Score Finanzas OS' })).toBeVisible()
})

test('records a card purchase and payment without double-counting the debt', async ({ page }) => {
  await page.getByRole('button', { name: /Nuevo espacio/i }).first().click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await dialog.getByLabel('Nombre del perfil').fill('E2E Tarjeta')
  await dialog.getByRole('button', { name: /Crear y capturar datos/i }).click()

  const accountPanel = page.locator('.capture-card').filter({ has: page.getByRole('heading', { name: 'Agregar cuenta o deuda' }) })
  await accountPanel.getByLabel('Nombre').fill('E2E Nómina')
  await accountPanel.getByLabel('Saldo actual').fill('10000')
  await accountPanel.getByRole('button', { name: /Agregar cuenta/i }).click()

  await accountPanel.getByLabel('Nombre').fill('E2E Tarjeta')
  await accountPanel.getByLabel('Tipo').selectOption('credit_card')
  await accountPanel.getByLabel('Saldo adeudado').fill('0')
  await accountPanel.getByLabel('Límite de crédito').fill('5000')
  await accountPanel.getByLabel('Pago mínimo').fill('100')
  await accountPanel.getByLabel('Fecha límite').fill('2026-07-31')
  await accountPanel.getByRole('button', { name: /Agregar cuenta/i }).click()

  const movementPanel = page.locator('.capture-card').filter({ has: page.getByRole('heading', { name: 'Registrar movimiento' }) })
  await movementPanel.getByLabel('Cuenta').selectOption({ label: 'E2E Tarjeta' })
  await movementPanel.getByLabel('Monto').fill('350')
  await movementPanel.getByLabel('Comercio / origen').fill('Compra tarjeta E2E')
  await movementPanel.getByRole('button', { name: /Guardar movimiento/i }).click()

  await movementPanel.getByLabel('Tipo').selectOption('debt_payment')
  await movementPanel.getByLabel('Cuenta de origen').selectOption({ label: 'E2E Nómina' })
  await movementPanel.getByLabel('Deuda destino').selectOption({ label: 'E2E Tarjeta' })
  await movementPanel.getByLabel('Monto').fill('100')
  await movementPanel.getByLabel('Comercio / origen').fill('Pago tarjeta E2E')
  await movementPanel.getByRole('button', { name: /Guardar movimiento/i }).click()

  const profilesResponse = await page.request.get('/api/profiles')
  const body = (await profilesResponse.json()) as { profiles: FinancialProfile[] }
  const saved = body.profiles.find((profile) => profile.name === 'E2E Tarjeta')
  expect(saved?.accounts.find((account) => account.name === 'E2E Nómina')?.balance).toBe(9900)
  expect(saved?.accounts.find((account) => account.name === 'E2E Tarjeta')?.balance).toBe(-250)
  expect(saved?.debts.find((debt) => debt.name === 'E2E Tarjeta')?.balance).toBe(250)
})

test('creates a profile with a starter goal and opens planning', async ({ page }) => {
  await page.getByRole('button', { name: /Nuevo espacio/i }).first().click()
  const dialog = page.getByRole('dialog', { name: /Crear perfil financiero/i })
  await dialog.getByLabel('Nombre del perfil').fill('E2E Perfil meta')
  await dialog.locator('.starter-goal').getByRole('button', { name: 'Agregar' }).click()
  const starterGoal = dialog.locator('.starter-goal')
  await starterGoal.getByLabel('Nombre').fill('E2E Fondo emergencia 6 meses')
  await starterGoal.getByLabel('Monto objetivo').fill('180000')
  await starterGoal.getByLabel('Ya tengo').fill('45000')
  await starterGoal.getByLabel('Fecha objetivo').fill('2026-12-31')
  await starterGoal.getByLabel('Aportacion mensual planeada').fill('7500')
  await dialog.getByRole('button', { name: /Crear y revisar meta/i }).click()

  await expect(page.getByRole('heading', { name: 'Metas y planeacion' })).toBeVisible()
  await expect(page.getByText('E2E Fondo emergencia 6 meses')).toBeVisible()
  await expect(page.getByText('Plan cubierto')).toBeVisible()
})

test('shows planning details for the goals demo profile', async ({ page }) => {
  const profileCard = page.locator('.profile-card', { hasText: 'Metas grandes' })
  await profileCard.getByRole('button', { name: /Abrir resumen/i }).click()
  await page.getByRole('button', { name: 'Metas' }).click()

  await expect(page.getByRole('heading', { name: 'Metas y planeacion' })).toBeVisible()
  await expect(page.getByText('Fondo emergencia 6 meses')).toBeVisible()
  await expect(page.getByRole('link', { name: 'fuente' }).first()).toBeVisible()
})

test('imports synthetic CSV, XML and receipt image into the active profile', async ({ page }) => {
  await page.locator('nav').getByRole('button', { name: 'Documentos' }).click()
  const fixtures = generateSyntheticDocumentFixtures()
  const csv = [
    'Fecha,Fecha de Compra,Descripción,Titular de la Tarjeta,Cuenta,Importe,Monto en moneda extranjera,Tipo de Cambio,Información Adicional,Aparece en su Estado de Cuenta como,Dirección,Población/Provincia,Código postal,País,Referencia',
    '13 Jun 2026,12 Jun 2026,E2E Supermercado,PERSONA E2E,****1001,820.00,,,,E2E SUPERMERCADO,,,,MX,REF-E2E-001',
    '15 Jun 2026,15 Jun 2026,E2E Pago recibido,PERSONA E2E,****1001,-12000.00,,,,E2E PAGO RECIBIDO,,,,MX,REF-E2E-002',
    '18 Jun 2026,17 Jun 2026,E2E Compra internacional,PERSONA E2E,****1001,99.99,5.25 USD,19.05,,E2E COMERCIO EXTRANJERO,,,,US,REF-E2E-003',
  ].join('\n')
  const payrollStatementCsv = [
    'Fecha,Descripción,Tipo,Monto,Saldo',
    '2026-06-15,E2E NOMINA EMPRESA,Depósito,42000.00,42000.00',
    '2026-06-16,E2E RETIRO CAJERO NOMINA,Retiro,1500.00,40500.00',
    '2026-06-17,E2E PAGO TARJETA,Retiro,12000.00,28500.00',
    '2026-06-18,E2E SPEI ENTRE CUENTAS,Retiro,5000.00,23500.00',
    '2026-06-19,E2E SPEI A GBM INVERSION,Retiro,2500.00,21000.00',
    '2026-06-20,E2E TRANSFERENCIA CUENTA PROPIA,Ingreso,700.00,21700.00',
    '2026-06-21,E2E MONTO SIN DIRECCION,,999.00,22699.00',
  ].join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-06-15" Total="42000.00" SubTotal="48200.00">
  <cfdi:Emisor Nombre="EMPRESA E2E SA DE CV" Rfc="AAA010101AAA" />
  <cfdi:Receptor Nombre="PERSONA E2E" Rfc="XAXX010101000" />
  <cfdi:Complemento>
    <nomina12:Nomina Version="1.2" TipoNomina="O" FechaPago="2026-06-15" FechaInicialPago="2026-06-01" FechaFinalPago="2026-06-15" NumDiasPagados="15.000" TotalPercepciones="48000.00" TotalDeducciones="6200.00" TotalOtrosPagos="200.00">
      <nomina12:Emisor RegistroPatronal="Y1234567890" />
      <nomina12:Receptor Curp="XAXX010101HDFXXX00" NumSeguridadSocial="12345678901" NumEmpleado="EMP-12345" TipoContrato="01" TipoJornada="01" TipoRegimen="02" RiesgoPuesto="2" PeriodicidadPago="04" Banco="012" CuentaBancaria="123456789012345678" SalarioBaseCotApor="1600.00" SalarioDiarioIntegrado="1700.00" ClaveEntFed="CMX" />
      <nomina12:Percepciones TotalSueldos="48000.00" TotalGravado="48000.00" TotalExento="0.00"><nomina12:Percepcion TipoPercepcion="001" Clave="P001" Concepto="Sueldo" ImporteGravado="48000.00" ImporteExento="0.00" /></nomina12:Percepciones>
      <nomina12:Deducciones TotalOtrasDeducciones="200.00" TotalImpuestosRetenidos="6000.00">
        <nomina12:Deduccion TipoDeduccion="002" Clave="D001" Concepto="ISR" Importe="6000.00" />
        <nomina12:Deduccion TipoDeduccion="001" Clave="D002" Concepto="IMSS" Importe="200.00" />
      </nomina12:Deducciones>
      <nomina12:OtrosPagos><nomina12:OtroPago TipoOtroPago="002" Clave="OP001" Concepto="Subsidio empleo" Importe="200.00"><nomina12:SubsidioAlEmpleo SubsidioCausado="200.00" /></nomina12:OtroPago></nomina12:OtrosPagos>
    </nomina12:Nomina>
    <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555" />
  </cfdi:Complemento>
</cfdi:Comprobante>`
  const receiptPngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 520
    canvas.height = 220
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'black'
    ctx.font = '34px Arial'
    ctx.fillText('TIENDA DEMO', 28, 50)
    ctx.fillText('2026-06-08', 28, 105)
    ctx.fillText('TOTAL 1250.50', 28, 165)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const cardPdfBuffer = readFileSync(fixtures.pdfPath)
  const gbmOperationsCsvBuffer = readFileSync(fixtures.gbmOperationsCsvPath)
  const nuSavingsPdfBuffer = readFileSync(fixtures.nuSavingsPdfPath)
  const gbmInvestmentPdfBuffer = readFileSync(fixtures.gbmInvestmentPdfPath)
  const cetesInvestmentPdfBuffer = readFileSync(fixtures.cetesInvestmentPdfPath)
  const pprRetirementPdfBuffer = readFileSync(fixtures.pprRetirementPdfPath)
  const aforeRetirementPdfBuffer = readFileSync(fixtures.aforeRetirementPdfPath)
  const payrollPdfBuffer = readFileSync(fixtures.payrollPdfPath)

  await page
    .locator('label.drop-zone')
    .locator('input[type="file"]')
    .setInputFiles([
      {
        name: 'e2e-movimientos.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
      },
      {
        name: 'e2e-estado-cuenta-nomina.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(payrollStatementCsv),
      },
      {
        name: 'e2e-nomina.xml',
        mimeType: 'application/xml',
        buffer: Buffer.from(xml),
      },
      {
        name: 'e2e-recibo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(receiptPngBase64, 'base64'),
      },
      {
        name: 'estado-cuenta-tarjeta-demo.pdf',
        mimeType: 'application/pdf',
        buffer: cardPdfBuffer,
      },
      {
        name: 'operaciones-gbm-demo.csv',
        mimeType: 'text/csv',
        buffer: gbmOperationsCsvBuffer,
      },
      {
        name: 'estado-cuenta-nu-cajitas-demo.pdf',
        mimeType: 'application/pdf',
        buffer: nuSavingsPdfBuffer,
      },
      {
        name: 'estado-cuenta-gbm-smart-cash-demo.pdf',
        mimeType: 'application/pdf',
        buffer: gbmInvestmentPdfBuffer,
      },
      {
        name: 'estado-cuenta-cetesdirecto-demo.pdf',
        mimeType: 'application/pdf',
        buffer: cetesInvestmentPdfBuffer,
      },
      {
        name: 'estado-cuenta-ppr-demo.pdf',
        mimeType: 'application/pdf',
        buffer: pprRetirementPdfBuffer,
      },
      {
        name: 'estado-cuenta-afore-demo.pdf',
        mimeType: 'application/pdf',
        buffer: aforeRetirementPdfBuffer,
      },
      {
        name: 'recibo-nomina-demo.pdf',
        mimeType: 'application/pdf',
        buffer: payrollPdfBuffer,
      },
    ])

  await expect(page.getByText(/12 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })
  const recentDocuments = page.locator('.document-list')
  const documentCards = page.getByTestId('imported-document-card')
  await expect(documentCards).toHaveCount(12)
  for (const fileName of [
    'e2e-movimientos.csv',
    'e2e-estado-cuenta-nomina.csv',
    'e2e-nomina.xml',
    'e2e-recibo.png',
    'estado-cuenta-tarjeta-demo.pdf',
    'operaciones-gbm-demo.csv',
    'estado-cuenta-nu-cajitas-demo.pdf',
    'estado-cuenta-gbm-smart-cash-demo.pdf',
    'estado-cuenta-cetesdirecto-demo.pdf',
    'estado-cuenta-ppr-demo.pdf',
    'estado-cuenta-afore-demo.pdf',
    'recibo-nomina-demo.pdf',
  ]) {
    await expect(recentDocuments).not.toContainText(fileName)
  }
  await expect(page.getByText(/Vista protegida: nombres de archivo/i)).toBeVisible()
  await expect(page.getByLabel('Plan de mejora de datos documentales')).toBeVisible()
  await expect(page.getByText('Reimportar primero')).toBeVisible()
  await expect(page.locator('[data-testid="document-detail-table"][open]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Reanalizar documentos guardados/i })).toBeVisible()
  await page.getByRole('button', { name: /Reanalizar documentos guardados/i }).click()
  await expect(page.getByText(/Reanalisis local actualizado|ya estaban alineados/i)).toBeVisible()
  await expect(page.getByLabel('Estado de captura de documentos')).toContainText('Extractor actual')

  const bankStatementDocument = documentCards
    .filter({ hasText: /CSV · Bancos y ahorro · processed/i })
    .filter({ hasText: 'Conciliacion banco' })
    .filter({ hasText: '$43,699' })
    .first()
  await expect(bankStatementDocument.getByText(/CSV · Bancos y ahorro · processed/i)).toBeVisible()
  await expect(bankStatementDocument.getByText('Conciliacion banco')).toBeVisible()
  await expect(bankStatementDocument.getByText('cuadra')).toBeVisible()
  await expect(bankStatementDocument.getByText('Depositos', { exact: true })).toBeVisible()
  await expect(bankStatementDocument.getByText('$43,699')).toBeVisible()
  await expect(bankStatementDocument.getByText('Retiros', { exact: true })).toBeVisible()
  await expect(bankStatementDocument.getByText('$21,000').first()).toBeVisible()
  await expect(bankStatementDocument.getByText('Flujo neto')).toBeVisible()
  await expect(bankStatementDocument.getByText('$22,699').first()).toBeVisible()
  await expect(bankStatementDocument.getByText('Depositos nomina')).toBeVisible()
  await expect(bankStatementDocument.getByText('Cuenta nomina mixta')).toBeVisible()
  await expect(bankStatementDocument.getByText('Depositos cuenta nomina')).toBeVisible()
  await expect(bankStatementDocument.getByText('Retiros cuenta nomina')).toBeVisible()
  await expect(bankStatementDocument.getByText('Mov. deposito')).toBeVisible()
  await expect(bankStatementDocument.getByText('Mov. retiro')).toBeVisible()
  await expect(bankStatementDocument.getByText('Inferidos por saldo')).toBeVisible()
  await expect(bankStatementDocument.getByText('Pagos deuda')).toBeVisible()
  await expect(bankStatementDocument.getByText('Transferencias')).toBeVisible()
  await expect(bankStatementDocument.getByText('Saldo final', { exact: true })).toBeVisible()
  await expect(bankStatementDocument.getByText('$22,699').first()).toBeVisible()
  await expect(page.getByLabel('Riesgo de conteo y conciliacion')).toContainText('1 movimiento(s) de nomina no se duplicaron.')
  await expect(page.getByLabel('Brechas de captura documental')).toBeVisible()
  await expect(page.getByLabel('Estado de captura de documentos')).toBeVisible()
  await expect(page.getByLabel('Estado de captura de documentos')).toContainText('Extractor actual')
  await expect(page.getByLabel('Estado de captura de documentos')).toContainText('Reimportar')
  await expect(page.getByText(/no duplica el dashboard/i).first()).toBeVisible()
  await expect(page.getByText(/confianza/i).first()).toBeVisible()
  await expect(page.getByText(/OCR local/i).first()).toBeVisible()
  const payrollXmlCard = page
    .locator('[data-testid="imported-document-card"][data-document-kind="payroll_cfdi"]')
    .filter({ hasText: /XML · Nomina CFDI/i })
    .first()
  await expect(payrollXmlCard.getByText('Inicio periodo')).toBeVisible()
  await expect(payrollXmlCard.getByText('2026-06-01')).toBeVisible()
  await expect(payrollXmlCard.getByText('Fin periodo')).toBeVisible()
  await expect(payrollXmlCard.getByText('Version nomina')).toBeVisible()
  await expect(payrollXmlCard.getByText('ISR retenido')).toBeVisible()
  await expect(payrollXmlCard.getByText('$6,000').first()).toBeVisible()
  const payrollPerceptions = payrollXmlCard.locator('[data-testid="document-detail-table"][data-detail-title="Percepciones de nomina para revisar"]')
  await expect(payrollPerceptions).toBeVisible()
  await payrollPerceptions.locator('summary').click()
  await expect(payrollPerceptions.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  await expect(payrollPerceptions.getByRole('cell', { name: 'Sueldo' })).toHaveCount(0)
  await expect(payrollXmlCard.getByText('Deducciones de nomina para revisar')).toBeVisible()
  await expect(payrollXmlCard.getByText('Otros pagos de nomina para revisar')).toBeVisible()
  const payrollPdfCard = page
    .locator('[data-testid="imported-document-card"][data-document-kind="payroll_cfdi"]')
    .filter({ hasText: /PDF · Nomina CFDI · needs_review/i })
    .first()
  await expect(payrollPdfCard.getByText('Fecha pago')).toBeVisible()
  await expect(payrollPdfCard.getByText('2026-06-15').first()).toBeVisible()
  await expect(payrollPdfCard.getByText('Inicio periodo')).toBeVisible()
  await expect(payrollPdfCard.getByText('Emisor nomina')).toBeVisible()
  await expect(payrollPdfCard.getByText('EMPRESA DEMO SERVICIOS SA DE CV')).toBeVisible()
  const cardPdf = page.locator('[data-testid="imported-document-card"][data-document-kind="credit_card_statement"]').first()
  await expect(cardPdf.getByText(/PDF · Tarjetas de credito · needs_review/i)).toBeVisible()
  await expect(cardPdf.getByText(/Campos clave:/)).toBeVisible()
  await expect(cardPdf.getByText('Conciliacion tarjeta')).toBeVisible()
  await expect(cardPdf.getByText('cuadra')).toBeVisible()
  await expect(cardPdf.getByText('Diferencia conciliacion')).toBeVisible()
  await expect(cardPdf.getByText('$0').first()).toBeVisible()
  await expect(cardPdf.getByText('Movimientos de tarjeta para revisar')).toBeVisible()
  const cardMovements = cardPdf.locator('[data-testid="document-detail-table"][data-detail-title="Movimientos de tarjeta para revisar"]')
  await cardMovements.locator('summary').click()
  await expect(cardMovements.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  await expect(cardMovements.getByRole('cell', { name: 'SUPERMERCADO DEMO' })).toHaveCount(0)
  await expect(cardPdf.getByText('Lectura PDF')).toBeVisible()
  await expect(cardPdf.getByText('Paginas leidas')).toBeVisible()
  await expect(cardMovements.getByRole('cell', { name: 'debt_payment' }).first()).toBeVisible()
  await expect(cardPdf.getByText('Escenarios de pago de tarjeta')).toBeVisible()
  const cardScenarios = cardPdf.locator('[data-testid="document-detail-table"][data-detail-title="Escenarios de pago de tarjeta"]')
  await cardScenarios.locator('summary').click()
  await expect(cardScenarios.getByRole('cell', { name: 'Pago minimo', exact: true })).toBeVisible()
  await expect(cardScenarios.getByRole('cell', { name: 'Pago minimo x2' })).toBeVisible()
  await expect(cardScenarios.getByRole('cell', { name: 'Pago minimo x5' })).toBeVisible()
  await expect(cardPdf.getByText('Mejor escenario')).toBeVisible()
  await expect(cardPdf.getByText('Ahorro maximo interes')).toBeVisible()
  await expect(cardPdf.getByRole('button', { name: /Aplicar movimientos revisados/i })).toBeVisible()
  const gbmCsv = page.locator('[data-testid="imported-document-card"][data-document-subtype="investment_statement.brokerage_operations"]').first()
  await expect(gbmCsv.getByText(/CSV · Inversiones · needs_review/i)).toBeVisible()
  await expect(gbmCsv.getByText('Operaciones inversion')).toBeVisible()
  await expect(gbmCsv.getByText('Importe operado')).toBeVisible()
  await expect(gbmCsv.getByText('Operaciones de inversion para revisar')).toBeVisible()
  const gbmOperations = gbmCsv.locator('[data-testid="document-detail-table"][data-detail-title="Operaciones de inversion para revisar"]')
  await gbmOperations.locator('summary').click()
  await expect(gbmOperations.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  await expect(gbmOperations.getByRole('cell', { name: 'CETES 28D' })).toHaveCount(0)
  const nuPdf = documentCards.filter({ hasText: 'Cajita Turbo' }).first()
  await expect(nuPdf.getByText(/PDF · Bancos y ahorro · needs_review/i)).toBeVisible()
  await expect(nuPdf.getByText(/Campos clave:/)).toBeVisible()
  await expect(nuPdf.getByText('Producto ahorro')).toBeVisible()
  await expect(nuPdf.getByText('Cajita Turbo')).toBeVisible()
  await expect(nuPdf.getByText('GAT nominal')).toBeVisible()
  await expect(nuPdf.getByText('13.9%')).toBeVisible()
  await expect(nuPdf.getByText('Movimientos visibles para revisar')).toBeVisible()
  const nuMovements = nuPdf.locator('[data-testid="document-detail-table"][data-detail-title="Movimientos visibles para revisar"]')
  await nuMovements.locator('summary').click()
  await expect(nuMovements.getByRole('cell', { name: '2026-06-03' })).toBeVisible()
  await expect(nuMovements.getByRole('cell', { name: '$25,000' })).toBeVisible()
  await expect(nuMovements.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  await expect(nuMovements.getByRole('cell', { name: 'NOMINA DEMO' })).toHaveCount(0)
  await expect(nuPdf.getByText('Cuenta nomina mixta')).toBeVisible()
  await expect(nuPdf.getByText('Depositos cuenta nomina')).toBeVisible()
  await expect(nuPdf.getByText('Retiros cuenta nomina')).toBeVisible()
  await expect(nuMovements.getByRole('cell', { name: 'debt_payment' })).toHaveCount(1)
  await expect(nuPdf.getByRole('button', { name: /Aplicar movimientos revisados/i })).toBeVisible()
  const gbmPdf = documentCards.filter({ hasText: 'GBM Smart Cash' }).first()
  await expect(gbmPdf.getByText(/PDF · Inversiones · needs_review/i)).toBeVisible()
  await expect(gbmPdf.getByText('Producto inversion')).toBeVisible()
  await expect(gbmPdf.getByText('GBM Smart Cash').first()).toBeVisible()
  await expect(gbmPdf.getByText('Valor portafolio')).toBeVisible()
  await expect(gbmPdf.getByText('$245,500')).toBeVisible()
  const cetesPdf = documentCards.filter({ hasText: 'Cetesdirecto' }).first()
  await expect(cetesPdf.getByText(/PDF · Inversiones · needs_review/i)).toBeVisible()
  await expect(cetesPdf.getByText('Producto inversion')).toBeVisible()
  await expect(cetesPdf.getByText('Cetesdirecto', { exact: true }).first()).toBeVisible()
  await expect(cetesPdf.getByText('Vencimiento', { exact: true })).toBeVisible()
  await expect(cetesPdf.getByText('Posiciones', { exact: true })).toBeVisible()
  await expect(cetesPdf.getByText('Valor posiciones')).toBeVisible()
  await expect(cetesPdf.getByText('Posiciones detectadas para revisar')).toBeVisible()
  const cetesPositions = cetesPdf.locator('[data-testid="document-detail-table"][data-detail-title="Posiciones detectadas para revisar"]')
  await cetesPositions.locator('summary').click()
  await expect(cetesPositions.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  await expect(cetesPositions.getByRole('cell', { name: '$149,250' })).toBeVisible()
  await expect(cetesPositions.getByRole('cell', { name: '$750' })).toBeVisible()
  const pprPdf = documentCards.filter({ hasText: 'PPR' }).first()
  await expect(pprPdf.getByText(/PDF · Inversiones · needs_review/i)).toBeVisible()
  await expect(pprPdf.getByText('Producto retiro')).toBeVisible()
  await expect(pprPdf.locator('dd').filter({ hasText: /^PPR$/ }).first()).toBeVisible()
  await expect(pprPdf.getByText('Saldo retiro')).toBeVisible()
  await expect(pprPdf.getByText('Posiciones', { exact: true })).toBeVisible()
  await expect(pprPdf.getByText('Posiciones detectadas para revisar')).toBeVisible()
  const pprPositions = pprPdf.locator('[data-testid="document-detail-table"][data-detail-title="Posiciones detectadas para revisar"]')
  await pprPositions.locator('summary').click()
  await expect(pprPositions.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  const aforePdf = documentCards.filter({ hasText: 'AFORE' }).first()
  await expect(aforePdf.getByText(/PDF · Inversiones · needs_review/i)).toBeVisible()
  await expect(aforePdf.getByText('Producto retiro')).toBeVisible()
  await expect(aforePdf.locator('dd').filter({ hasText: /^AFORE$/ }).first()).toBeVisible()
  await expect(aforePdf.getByText('Subcuentas', { exact: true })).toBeVisible()
  await expect(aforePdf.getByText('Subcuentas detalle')).toBeVisible()
  await expect(aforePdf.getByText('Subcuentas detectadas para revisar')).toBeVisible()
  const aforeSubaccounts = aforePdf.locator('[data-testid="document-detail-table"][data-detail-title="Subcuentas detectadas para revisar"]')
  await aforeSubaccounts.locator('summary').click()
  await expect(aforeSubaccounts.getByRole('cell', { name: 'Dato protegido' }).first()).toBeVisible()
  await expect(aforeSubaccounts.getByRole('cell', { name: '$430,000' })).toBeVisible()
  await page.locator('[data-testid="document-detail-table"][open]').evaluateAll((details) => {
    details.forEach((detail) => detail.removeAttribute('open'))
  })
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('19 mov.')
  await expect(page.locator('[aria-label="Perfil activo"]')).toContainText('12 doc(s)')
  await expect(page.getByText(/Reanalisis local actualizado en 12 documento\(s\)/i)).toBeVisible()

  const profilesResponse = await page.request.get('/api/profiles')
  expect(profilesResponse.ok()).toBe(true)
  const profilesBody = (await profilesResponse.json()) as { profiles: FinancialProfile[] }
  const importedProfile = profilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'e2e-estado-cuenta-nomina.csv'),
  )
  expect(importedProfile).toBeTruthy()
  const payrollIncomeTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-15' &&
        Math.round(transaction.amount * 100) === 4_200_000 &&
        transaction.type === 'income' &&
        /nomina/i.test(transaction.category),
    ) ?? []
  expect(payrollIncomeTransactions).toHaveLength(1)
  const payrollWithdrawalTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-16' &&
        Math.round(transaction.amount * 100) === -150_000 &&
        transaction.type === 'expense',
    ) ?? []
  expect(payrollWithdrawalTransactions).toHaveLength(1)
  const payrollDebtPaymentTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-17' &&
        Math.round(transaction.amount * 100) === -1_200_000 &&
        transaction.type === 'debt_payment',
    ) ?? []
  expect(payrollDebtPaymentTransactions).toHaveLength(1)
  const payrollTransferTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-18' &&
        Math.round(transaction.amount * 100) === -500_000 &&
        transaction.type === 'transfer',
    ) ?? []
  expect(payrollTransferTransactions).toHaveLength(1)
  const payrollInvestmentTransferTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-19' &&
        Math.round(transaction.amount * 100) === -250_000 &&
        transaction.type === 'transfer',
    ) ?? []
  expect(payrollInvestmentTransferTransactions).toHaveLength(1)
  const payrollTransferIncomeTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-20' &&
        Math.round(transaction.amount * 100) === 70_000 &&
        transaction.type === 'transfer',
    ) ?? []
  expect(payrollTransferIncomeTransactions).toHaveLength(1)
  const balanceDeltaTransferTransactions =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.date === '2026-06-21' &&
        Math.round(transaction.amount * 100) === 99_900 &&
        transaction.type === 'transfer',
    ) ?? []
  expect(balanceDeltaTransferTransactions).toHaveLength(1)
  const bankStatementImportedDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'e2e-estado-cuenta-nomina.csv')
  expect(bankStatementImportedDocument?.kind).toBe('bank_statement')
  expect(bankStatementImportedDocument?.extracted?.depositsTotal).toBe(43699)
  expect(bankStatementImportedDocument?.extracted?.withdrawalsTotal).toBe(21000)
  expect(bankStatementImportedDocument?.extracted?.netCashFlow).toBe(22699)
  expect(bankStatementImportedDocument?.extracted?.depositRows).toBe(3)
  expect(bankStatementImportedDocument?.extracted?.ambiguousDirectionRows).toBe(0)
  expect(bankStatementImportedDocument?.extracted?.balanceDeltaInferredRows).toBe(1)
  expect(bankStatementImportedDocument?.extracted?.balanceDeltaDepositRows).toBe(1)
  expect(bankStatementImportedDocument?.extracted?.balanceDeltaWithdrawalRows).toBe(0)
  expect(bankStatementImportedDocument?.extracted?.incomeRows).toBe(1)
  expect(bankStatementImportedDocument?.extracted?.expenseRows).toBe(1)
  expect(bankStatementImportedDocument?.extracted?.transferRows).toBe(4)
  expect(bankStatementImportedDocument?.extracted?.debtPaymentRows).toBe(1)
  expect(bankStatementImportedDocument?.extracted?.payrollDepositRows).toBe(1)
  expect(bankStatementImportedDocument?.extracted?.withdrawalRows).toBe(4)
  expect(bankStatementImportedDocument?.extracted?.payrollAccountDepositRows).toBe(3)
  expect(bankStatementImportedDocument?.extracted?.payrollAccountWithdrawalRows).toBe(4)
  expect(bankStatementImportedDocument?.extracted?.payrollAccountMixedFlow).toBe(true)
  expect(bankStatementImportedDocument?.extracted?.openingBalance).toBe(0)
  expect(bankStatementImportedDocument?.extracted?.expectedClosingBalance).toBe(22699)
  expect(bankStatementImportedDocument?.extracted?.bankBalanceDifference).toBe(0)
  expect(bankStatementImportedDocument?.extracted?.bankReconciliationStatus).toBe('balanced')
  const payrollXmlDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'e2e-nomina.xml')
  expect(payrollXmlDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(Number(payrollXmlDocument?.extracted?.skippedSemanticDuplicates ?? 0)).toBe(1)
  expect(payrollXmlDocument?.extracted?.matchedTransactionIds).toHaveLength(1)
  expect(payrollXmlDocument?.extracted?.periodStart).toBe('2026-06-01')
  expect(payrollXmlDocument?.extracted?.periodEnd).toBe('2026-06-15')
  expect(payrollXmlDocument?.extracted?.payrollComplementVersion).toBe('1.2')
  expect(payrollXmlDocument?.extracted?.payrollPeriodicity).toBe('04')
  expect(payrollXmlDocument?.extracted?.paidDays).toBe(15)
  expect(payrollXmlDocument?.extracted?.employeeCurpSuffix).toBe('XX00')
  expect(payrollXmlDocument?.extracted?.employeeNssSuffix).toBe('8901')
  expect(payrollXmlDocument?.extracted?.employerRegistrationSuffix).toBe('7890')
  expect(payrollXmlDocument?.extracted?.payrollUuidSuffix).toBe('55555555')
  expect(payrollXmlDocument?.extracted?.contractType).toBe('01')
  expect(payrollXmlDocument?.extracted?.employmentRegime).toBe('02')
  expect(payrollXmlDocument?.extracted?.bankCode).toBe('012')
  expect(payrollXmlDocument?.extracted?.isrWithheld).toBe(6000)
  expect(payrollXmlDocument?.extracted?.imssWithheld).toBe(200)
  expect(payrollXmlDocument?.extracted?.totalTaxesWithheld).toBe(6000)
  expect(payrollXmlDocument?.extracted?.totalOtherDeductions).toBe(200)
  expect(payrollXmlDocument?.extracted?.employmentSubsidyAmount).toBe(200)
  expect(payrollXmlDocument?.extracted?.detectedFields).toBe(13)
  expect(payrollXmlDocument?.extracted?.expectedFields).toBe(13)
  expect(payrollXmlDocument?.extracted?.missingFields).toEqual([])
  expect(payrollXmlDocument?.extracted?.perceptionConcepts).toHaveLength(1)
  expect((payrollXmlDocument?.extracted?.perceptionConcepts as Array<{ taxable: number }> | undefined)?.[0]?.taxable).toBe(48000)
  expect(payrollXmlDocument?.extracted?.deductionConcepts).toHaveLength(2)
  expect(payrollXmlDocument?.extracted?.otherPaymentConcepts).toHaveLength(1)
  const payrollPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'recibo-nomina-demo.pdf')
  expect(payrollPdfDocument?.kind).toBe('payroll_cfdi')
  expect(payrollPdfDocument?.extracted?.paymentDate).toBe('2026-06-15')
  expect(payrollPdfDocument?.extracted?.periodStart).toBe('2026-06-01')
  expect(payrollPdfDocument?.extracted?.periodEnd).toBe('2026-06-15')
  expect(payrollPdfDocument?.extracted?.employerName).toBe('EMPRESA DEMO SERVICIOS SA DE CV')
  expect(payrollPdfDocument?.extracted?.netIncome).toBe(42000)
  expect(payrollPdfDocument?.extracted?.grossPay).toBe(48000)
  expect(payrollPdfDocument?.extracted?.totalDeductions).toBe(6200)
  expect(payrollPdfDocument?.extracted?.totalOtherPayments).toBe(200)
  expect(payrollPdfDocument?.extracted?.employerName).not.toMatch(/^000010000007/)
  expect(payrollPdfDocument?.extracted?.missingFields).toEqual([])
  const cardPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-tarjeta-demo.pdf')
  expect(cardPdfDocument?.kind).toBe('credit_card_statement')
  expect(cardPdfDocument?.status).toBe('needs_review')
  expect(cardPdfDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(cardPdfDocument?.documentFingerprint).toBeTruthy()
  expect(cardPdfDocument?.fingerprintVersion).toBe('content-v1')
  expect(cardPdfDocument?.extracted?.pdfTextMode).toBe('layout')
  expect(cardPdfDocument?.extracted?.pdfTextPagesRead).toBe(5)
  expect(cardPdfDocument?.extracted?.pagesWithLayoutText).toBe(5)
  expect(cardPdfDocument?.extracted?.previousBalance).toBe(7000)
  expect(cardPdfDocument?.extracted?.newCharges).toBe(1250.5)
  expect(cardPdfDocument?.extracted?.deferredAmortization).toBe(0)
  expect(cardPdfDocument?.extracted?.paymentsAmount).toBe(3350)
  expect(cardPdfDocument?.extracted?.interestAmount).toBe(100)
  expect(cardPdfDocument?.extracted?.feesAmount).toBe(50)
  expect(cardPdfDocument?.extracted?.vatAmount).toBe(49.5)
  expect(cardPdfDocument?.extracted?.financialCostsTotal).toBe(199.5)
  expect(cardPdfDocument?.extracted?.cardReconciliationExpectedBalance).toBe(5100)
  expect(cardPdfDocument?.extracted?.cardReconciliationDifference).toBe(0)
  expect(cardPdfDocument?.extracted?.cardReconciliationStatus).toBe('balanced')
  expect(cardPdfDocument?.extracted?.cardReconciliationSeverity).toBe('ok')
  expect(cardPdfDocument?.extracted?.cardMovementRowCount).toBe(7)
  expect(cardPdfDocument?.extracted?.cardChargesRows).toBe(2)
  expect(cardPdfDocument?.extracted?.cardPaymentsRows).toBe(2)
  expect(cardPdfDocument?.extracted?.cardCreditsRows).toBe(3)
  expect(cardPdfDocument?.extracted?.cardChargesTotal).toBe(1650.5)
  expect(cardPdfDocument?.extracted?.cardPaymentsTotal).toBe(4200)
  expect(cardPdfDocument?.extracted?.cardCreditsTotal).toBe(275)
  expect(cardPdfDocument?.extracted?.cardNetActivity).toBe(-2824.5)
  expect(cardPdfDocument?.extracted?.cardBalanceDeltaRows).toBe(3)
  expect(cardPdfDocument?.extracted?.cardPaymentScenarioRows).toBe(3)
  expect(cardPdfDocument?.extracted?.cardLowestInterestScenario).toBe('Pago minimo x5')
  expect(cardPdfDocument?.extracted?.cardLowestEstimatedInterest).toBe(0)
  expect(cardPdfDocument?.extracted?.cardMaxInterestSavings).toBe(950)
  expect(cardPdfDocument?.extracted?.cardPaymentScenarios).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ scenarioName: 'Pago minimo', monthlyPayment: 1250, monthsToPayoff: 8, estimatedInterest: 950 }),
      expect.objectContaining({ scenarioName: 'Pago minimo x2', monthlyPayment: 2500, monthsToPayoff: 3, estimatedInterest: 280 }),
      expect.objectContaining({ scenarioName: 'Pago minimo x5', monthlyPayment: 6250, monthsToPayoff: 1, estimatedInterest: 0 }),
    ]),
  )
  expect(cardPdfDocument?.extracted?.cardMovementRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ date: '2026-06-03', description: 'SUPERMERCADO DEMO', charge: 1250.5, movementType: 'expense' }),
      expect.objectContaining({ date: '2026-06-05', description: 'PAGO RECIBIDO', payment: 3200, movementType: 'debt_payment' }),
      expect.objectContaining({ date: '2026-06-08', description: 'BONIFICACION DEMO', credit: 150, movementType: 'transfer' }),
      expect.objectContaining({ date: '2026-06-10', description: 'FARMACIA DEMO', credit: 75, movementType: 'transfer' }),
      expect.objectContaining({ date: '2026-06-11', description: 'RESTAURANTE DEMO', charge: 400, balance: 7400, movementType: 'expense' }),
      expect.objectContaining({ date: '2026-06-12', description: 'PAGO APP DEMO', payment: 1000, balance: 6400, movementType: 'debt_payment' }),
      expect.objectContaining({ date: '2026-06-13', description: 'BONIFICACION COMERCIO DEMO', credit: 50, balance: 6350, movementType: 'transfer' }),
    ]),
  )
  const originalDocumentCount = importedProfile?.importedDocuments.length ?? 0
  await page
    .locator('label.drop-zone')
    .locator('input[type="file"]')
    .setInputFiles([
      {
        name: 'estado-cuenta-tarjeta-renombrado.pdf',
        mimeType: 'application/pdf',
        buffer: cardPdfBuffer,
      },
    ])
  await expect(page.getByText(/1 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })
  await expect(recentDocuments).not.toContainText(/estado-cuenta-tarjeta-(renombrado|demo)\.pdf/i)

  const reimportProfilesResponse = await page.request.get('/api/profiles')
  expect(reimportProfilesResponse.ok()).toBe(true)
  const reimportProfilesBody = (await reimportProfilesResponse.json()) as { profiles: FinancialProfile[] }
  const reimportedProfile = reimportProfilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'estado-cuenta-tarjeta-renombrado.pdf'),
  )
  const cardFingerprint = cardPdfDocument?.documentFingerprint
  const reimportedCardDocuments = reimportedProfile?.importedDocuments.filter((document) => document.documentFingerprint === cardFingerprint) ?? []
  expect(reimportedProfile?.importedDocuments).toHaveLength(originalDocumentCount)
  expect(reimportedCardDocuments).toHaveLength(1)
  expect(reimportedCardDocuments[0]?.id).toBe(cardPdfDocument?.id)
  expect(reimportedCardDocuments[0]?.fileName).toBe('estado-cuenta-tarjeta-renombrado.pdf')
  expect(reimportedCardDocuments[0]?.warnings ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/contenido ya conocido/i)]))
  const reimportedCardPdf = page.locator('[data-testid="imported-document-card"][data-document-kind="credit_card_statement"]').first()
  await expect(reimportedCardPdf.getByRole('button', { name: /Aplicar movimientos revisados/i })).toBeVisible()
  await reimportedCardPdf.getByRole('button', { name: /Aplicar movimientos revisados/i }).click()
  await expect(page.getByText(/Movimientos revisados aplicados: 7/i)).toBeVisible()
  await expect(reimportedCardPdf.getByText(/Movimientos PDF aplicados: 7/i)).toBeVisible()
  await expect(reimportedCardPdf.getByRole('button', { name: /Aplicar movimientos revisados/i })).toHaveCount(0)

  const approvedCardProfilesResponse = await page.request.get('/api/profiles')
  expect(approvedCardProfilesResponse.ok()).toBe(true)
  const approvedCardProfilesBody = (await approvedCardProfilesResponse.json()) as { profiles: FinancialProfile[] }
  const approvedCardProfile = approvedCardProfilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'estado-cuenta-tarjeta-renombrado.pdf'),
  )
  const approvedCardDocument = approvedCardProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-tarjeta-renombrado.pdf')
  expect(approvedCardDocument?.status).toBe('processed')
  expect(approvedCardDocument?.sourceTransactionIds).toHaveLength(7)
  expect(approvedCardDocument?.extracted?.appliedRows).toBe(7)
  expect(approvedCardDocument?.extracted?.reviewedMovementRowsApplied).toBe(7)
  expect(approvedCardDocument?.extracted?.reviewedMovementRowsApproval).toBe('manual_user_action')
  expect(typeof approvedCardDocument?.extracted?.reviewedMovementRowsAppliedAt).toBe('string')
  const approvedCardAccount = approvedCardProfile?.accounts.find((account) => account.id === approvedCardDocument?.extracted?.accountId)
  expect(approvedCardAccount?.type).toBe('credit_card')
  expect(approvedCardAccount?.balance).toBe(-5100)
  expect(approvedCardAccount?.creditLimit).toBe(120000)
  expect(approvedCardProfile?.transactions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ merchant: 'SUPERMERCADO DEMO', amount: -1250.5, type: 'expense' }),
      expect.objectContaining({ merchant: 'PAGO RECIBIDO', amount: 3200, type: 'debt_payment' }),
      expect.objectContaining({ merchant: 'BONIFICACION DEMO', amount: 150, type: 'transfer' }),
      expect.objectContaining({ merchant: 'FARMACIA DEMO', amount: 75, type: 'transfer' }),
      expect.objectContaining({ merchant: 'RESTAURANTE DEMO', amount: -400, type: 'expense' }),
      expect.objectContaining({ merchant: 'PAGO APP DEMO', amount: 1000, type: 'debt_payment' }),
      expect.objectContaining({ merchant: 'BONIFICACION COMERCIO DEMO', amount: 50, type: 'transfer' }),
    ]),
  )
  expect(approvedCardProfile?.debts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ balance: 5100, creditLimit: 120000, minimumPayment: 1250, dueDate: '2026-07-05' }),
    ]),
  )
  await page
    .locator('label.drop-zone')
    .locator('input[type="file"]')
    .setInputFiles([
      {
        name: 'estado-cuenta-tarjeta-reanalizado.pdf',
        mimeType: 'application/pdf',
        buffer: cardPdfBuffer,
      },
    ])
  await expect(page.getByText(/1 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })
  const refreshedCardProfilesResponse = await page.request.get('/api/profiles')
  expect(refreshedCardProfilesResponse.ok()).toBe(true)
  const refreshedCardProfilesBody = (await refreshedCardProfilesResponse.json()) as { profiles: FinancialProfile[] }
  const refreshedCardProfile = refreshedCardProfilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'estado-cuenta-tarjeta-reanalizado.pdf'),
  )
  const refreshedCardDocument = refreshedCardProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-tarjeta-reanalizado.pdf')
  expect(refreshedCardDocument?.status).toBe('needs_review')
  expect(refreshedCardDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(refreshedCardDocument?.extracted?.reviewedMovementRowsAppliedAt).toBeUndefined()
  const refreshedCardPdf = page.locator('[data-testid="imported-document-card"][data-document-kind="credit_card_statement"]').first()
  await expect(refreshedCardPdf.getByRole('button', { name: /Aplicar movimientos revisados/i })).toBeVisible()
  const gbmOperationsCsvDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'operaciones-gbm-demo.csv')
  expect(gbmOperationsCsvDocument?.kind).toBe('investment_statement')
  expect(gbmOperationsCsvDocument?.status).toBe('needs_review')
  expect(gbmOperationsCsvDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(gbmOperationsCsvDocument?.extracted?.schema).toBe('investment_operations_review')
  expect(gbmOperationsCsvDocument?.extracted?.investmentOperationRowCount).toBe(3)
  expect(gbmOperationsCsvDocument?.extracted?.investmentBuyRows).toBe(1)
  expect(gbmOperationsCsvDocument?.extracted?.investmentSellRows).toBe(1)
  expect(gbmOperationsCsvDocument?.extracted?.investmentIncomeRows).toBe(1)
  expect(gbmOperationsCsvDocument?.extracted?.commissionsAmount).toBe(63)
  expect(gbmOperationsCsvDocument?.extracted?.taxWithheld).toBe(40)
  expect(gbmOperationsCsvDocument?.extracted?.tradedAmount).toBe(151410)
  expect(gbmOperationsCsvDocument?.extracted?.tickers).toEqual(expect.arrayContaining(['CETES 28D', 'GBMTRAC ETF', 'FIBRA DEMO']))
  expect(gbmOperationsCsvDocument?.extracted?.investmentOperationRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ tradeDate: '2026-06-04', settlementDate: '2026-06-06', operationType: 'buy', ticker: 'CETES 28D', quantity: 15000, price: 9.95 }),
      expect.objectContaining({ tradeDate: '2026-06-11', settlementDate: '2026-06-13', operationType: 'sell', ticker: 'GBMTRAC ETF', grossAmount: 1810, commission: 18 }),
      expect.objectContaining({ tradeDate: '2026-06-20', operationType: 'income', ticker: 'FIBRA DEMO', grossAmount: 350, taxWithheld: 35 }),
    ]),
  )
  const nuSavingsPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-nu-cajitas-demo.pdf')
  expect(nuSavingsPdfDocument?.kind).toBe('bank_statement')
  expect(nuSavingsPdfDocument?.status).toBe('needs_review')
  expect(nuSavingsPdfDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(nuSavingsPdfDocument?.extracted?.appliedRows).toBe(0)
  expect(nuSavingsPdfDocument?.extracted?.pdfTextMode).toBe('layout')
  expect(nuSavingsPdfDocument?.extracted?.pdfTextPagesRead).toBe(2)
  expect(nuSavingsPdfDocument?.extracted?.accountType).toBe('savings')
  expect(nuSavingsPdfDocument?.extracted?.savingsProduct).toBe('Cajita Turbo')
  expect(nuSavingsPdfDocument?.extracted?.closingBalance).toBe(95000)
  expect(nuSavingsPdfDocument?.extracted?.depositsTotal).toBe(25000)
  expect(nuSavingsPdfDocument?.extracted?.withdrawalsTotal).toBe(10000)
  expect(nuSavingsPdfDocument?.extracted?.annualYieldPercent).toBe(13)
  expect(nuSavingsPdfDocument?.extracted?.nominalGatPercent).toBe(13.88)
  expect(nuSavingsPdfDocument?.extracted?.realGatPercent).toBe(9.77)
  expect(nuSavingsPdfDocument?.extracted?.yieldCalculationDate).toBe('2026-05-07')
  expect(nuSavingsPdfDocument?.extracted?.yieldValidUntil).toBe('2026-07-08')
  expect(nuSavingsPdfDocument?.extracted?.periodYield).toBe(845.3)
  expect(nuSavingsPdfDocument?.extracted?.frozenTermDays).toBe(28)
  expect(nuSavingsPdfDocument?.extracted?.protectionLimitUdis).toBe(25000)
  expect(nuSavingsPdfDocument?.extracted?.monthlyDepositLimitUdis).toBe(30000)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementRowCount).toBe(8)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementDepositRows).toBe(3)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementWithdrawalRows).toBe(5)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementDepositsTotal).toBe(37845.3)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementWithdrawalsTotal).toBe(14845.3)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementNetCashFlow).toBe(23000)
  expect(nuSavingsPdfDocument?.extracted?.payrollDepositRows).toBe(2)
  expect(nuSavingsPdfDocument?.extracted?.payrollDepositTotal).toBe(37000)
  expect(nuSavingsPdfDocument?.extracted?.payrollAccountDepositRows).toBe(3)
  expect(nuSavingsPdfDocument?.extracted?.payrollAccountWithdrawalRows).toBe(5)
  expect(nuSavingsPdfDocument?.extracted?.payrollAccountMixedFlow).toBe(true)
  expect(nuSavingsPdfDocument?.extracted?.incomeRows).toBe(3)
  expect(nuSavingsPdfDocument?.extracted?.expenseRows).toBe(2)
  expect(nuSavingsPdfDocument?.extracted?.transferRows).toBe(2)
  expect(nuSavingsPdfDocument?.extracted?.debtPaymentRows).toBe(1)
  expect(nuSavingsPdfDocument?.extracted?.bankReconciliationStatus).toBe('balanced')
  expect(nuSavingsPdfDocument?.extracted?.speiDetected).toBe(true)
  expect(nuSavingsPdfDocument?.extracted?.speiTraceKey).toBe('demo123456')
  expect(nuSavingsPdfDocument?.extracted?.speiReferenceNumber).toBe('7654321')
  expect(nuSavingsPdfDocument?.extracted?.speiIssuerInstitution).toBe('banco demo')
  expect(nuSavingsPdfDocument?.extracted?.speiReceiverInstitution).toBe('nu mexico')
  expect(nuSavingsPdfDocument?.extracted?.speiBeneficiaryAccountLast4).toBe('4567')
  expect(nuSavingsPdfDocument?.extracted?.speiPaymentAmount).toBe(4000)
  expect(nuSavingsPdfDocument?.extracted?.statementMovementRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ date: '2026-06-03', description: 'NOMINA DEMO', deposit: 25000, balance: 105000, movementType: 'income', category: 'Nomina' }),
      expect.objectContaining({ date: '2026-06-07', description: 'RETIRO CAJITA', withdrawal: 6000, balance: 99000, movementType: 'transfer' }),
      expect.objectContaining({ date: '2026-06-12', description: 'SPEI A CUENTA PROPIA', withdrawal: 4000, balance: 95000, movementType: 'transfer' }),
      expect.objectContaining({ date: '2026-06-20', description: 'INTERES CAJITA', deposit: 845.3, balance: 95845.3, movementType: 'income' }),
      expect.objectContaining({ date: '2026-06-21', description: 'RETIRO ATM', withdrawal: 845.3, balance: 95000, movementType: 'expense' }),
      expect.objectContaining({ date: '2026-06-22', description: 'NOMINA COMPACTA DEMO', deposit: 12000, balance: 92000, movementType: 'income', category: 'Nomina' }),
      expect.objectContaining({ date: '2026-06-23', description: 'PAGO TARJETA COMPACTA DEMO', withdrawal: 3000, balance: 89000, movementType: 'debt_payment' }),
      expect.objectContaining({ date: '2026-06-24', description: 'RETIRO ATM COMPACTO', withdrawal: 1000, balance: 88000, movementType: 'expense' }),
    ]),
  )
  const gbmInvestmentPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-gbm-smart-cash-demo.pdf')
  expect(gbmInvestmentPdfDocument?.kind).toBe('investment_statement')
  expect(gbmInvestmentPdfDocument?.status).toBe('needs_review')
  expect(gbmInvestmentPdfDocument?.extracted?.investmentProduct).toBe('GBM Smart Cash')
  expect(gbmInvestmentPdfDocument?.extracted?.portfolioValue).toBe(245500)
  expect(gbmInvestmentPdfDocument?.extracted?.cashBalance).toBe(180000)
  expect(gbmInvestmentPdfDocument?.extracted?.availableToInvest).toBe(25000)
  expect(gbmInvestmentPdfDocument?.extracted?.periodReturn).toBe(1250.75)
  expect(gbmInvestmentPdfDocument?.extracted?.dailyReturn).toBe(82.5)
  expect(gbmInvestmentPdfDocument?.extracted?.annualYieldPercent).toBe(9.25)
  expect(gbmInvestmentPdfDocument?.extracted?.currency).toBe('MXN')
  expect(gbmInvestmentPdfDocument?.extracted?.market).toBe('MX')
  expect(gbmInvestmentPdfDocument?.extracted?.liquidity).toBe('liquidez diaria')
  expect(gbmInvestmentPdfDocument?.extracted?.settlementWindow).toBe('24 horas / 1 dia habil')
  expect(gbmInvestmentPdfDocument?.extracted?.contributionsTotal).toBe(20000)
  expect(gbmInvestmentPdfDocument?.extracted?.investmentWithdrawalsTotal).toBe(5000)
  expect(gbmInvestmentPdfDocument?.extracted?.commissionsAmount).toBe(120)
  expect(gbmInvestmentPdfDocument?.extracted?.taxWithheld).toBe(80)
  expect(gbmInvestmentPdfDocument?.extracted?.unrealizedGain).toBe(4500)
  expect(gbmInvestmentPdfDocument?.extracted?.detectedInstruments).toEqual(expect.arrayContaining(['smart cash', 'trading mx', 'acciones', 'etf', 'fondos', 'fibras', 'reporto']))
  const cetesInvestmentPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-cetesdirecto-demo.pdf')
  expect(cetesInvestmentPdfDocument?.kind).toBe('investment_statement')
  expect(cetesInvestmentPdfDocument?.status).toBe('needs_review')
  expect(cetesInvestmentPdfDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(cetesInvestmentPdfDocument?.extracted?.accountType).toBe('investment')
  expect(cetesInvestmentPdfDocument?.extracted?.investmentProduct).toBe('Cetesdirecto')
  expect(cetesInvestmentPdfDocument?.extracted?.portfolioValue).toBe(150000)
  expect(cetesInvestmentPdfDocument?.extracted?.instrumentType).toBe('CETES')
  expect(cetesInvestmentPdfDocument?.extracted?.titleCount).toBe(15000)
  expect(cetesInvestmentPdfDocument?.extracted?.maturityDate).toBe('2026-07-04')
  expect(cetesInvestmentPdfDocument?.extracted?.termDays).toBe(28)
  expect(cetesInvestmentPdfDocument?.extracted?.maturityValue).toBe(150000)
  expect(cetesInvestmentPdfDocument?.extracted?.availableToWithdraw).toBe(25000)
  expect(cetesInvestmentPdfDocument?.extracted?.dailyLiquidity).toBe(true)
  expect(cetesInvestmentPdfDocument?.extracted?.riskLevel).toBe('alto')
  expect(cetesInvestmentPdfDocument?.extracted?.settlementWindow).toBe('48 horas habiles')
  expect(cetesInvestmentPdfDocument?.extracted?.positionRows).toBe(2)
  expect(cetesInvestmentPdfDocument?.extracted?.positionsMarketValue).toBe(174250)
  expect(cetesInvestmentPdfDocument?.extracted?.positions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'cetes 28d', instrumentType: 'CETES', quantity: 15000, price: 9.95, marketValue: 149250, unrealizedGain: 750 }),
      expect.objectContaining({ name: 'bonddia', instrumentType: 'BONDDIA', quantity: 2500, price: 10, marketValue: 25000, unrealizedGain: 125 }),
    ]),
  )
  expect(cetesInvestmentPdfDocument?.extracted?.detectedInstruments).toEqual(expect.arrayContaining(['cetes', 'bonddia', 'enerfin', 'udibono']))
  const pprRetirementPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-ppr-demo.pdf')
  expect(pprRetirementPdfDocument?.kind).toBe('investment_statement')
  expect(pprRetirementPdfDocument?.status).toBe('needs_review')
  expect(pprRetirementPdfDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(pprRetirementPdfDocument?.extracted?.accountType).toBe('retirement')
  expect(pprRetirementPdfDocument?.extracted?.retirementProduct).toBe('PPR')
  expect(pprRetirementPdfDocument?.extracted?.retirementBalance).toBe(310000)
  expect(pprRetirementPdfDocument?.extracted?.monthlyContribution).toBe(8000)
  expect(pprRetirementPdfDocument?.extracted?.contributionsTotal).toBe(24000)
  expect(pprRetirementPdfDocument?.extracted?.taxDeductibleAmount).toBe(24000)
  expect(pprRetirementPdfDocument?.extracted?.nonDeductibleContributions).toBe(2000)
  expect(pprRetirementPdfDocument?.extracted?.periodReturn).toBe(2450)
  expect(pprRetirementPdfDocument?.extracted?.positionRows).toBe(2)
  expect(pprRetirementPdfDocument?.extracted?.positionsMarketValue).toBe(310000)
  expect(pprRetirementPdfDocument?.extracted?.positions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'fondo retiro balanceado', instrumentType: 'FONDO', quantity: 1200, marketValue: 144000, unrealizedGain: 12000 }),
      expect.objectContaining({ name: 'etf retiro mx', instrumentType: 'ETF', quantity: 300, marketValue: 166000, unrealizedGain: 8450 }),
    ]),
  )
  expect(pprRetirementPdfDocument?.extracted?.withdrawalRestriction).toBe(true)
  expect(pprRetirementPdfDocument?.extracted?.liquidityRestriction).toBe(true)
  const aforeRetirementPdfDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-afore-demo.pdf')
  expect(aforeRetirementPdfDocument?.kind).toBe('investment_statement')
  expect(aforeRetirementPdfDocument?.status).toBe('needs_review')
  expect(aforeRetirementPdfDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(aforeRetirementPdfDocument?.extracted?.accountType).toBe('retirement')
  expect(aforeRetirementPdfDocument?.extracted?.retirementProduct).toBe('AFORE')
  expect(aforeRetirementPdfDocument?.extracted?.aforeName).toContain('futuro')
  expect(aforeRetirementPdfDocument?.extracted?.retirementBalance).toBe(520000)
  expect(aforeRetirementPdfDocument?.extracted?.voluntaryContributions).toBe(35000)
  expect(aforeRetirementPdfDocument?.extracted?.mandatoryContributions).toBe(18500)
  expect(aforeRetirementPdfDocument?.extracted?.employerContributions).toBe(12000)
  expect(aforeRetirementPdfDocument?.extracted?.governmentContributions).toBe(1200)
  expect(aforeRetirementPdfDocument?.extracted?.retirementWithdrawals).toBe(4000)
  expect(aforeRetirementPdfDocument?.extracted?.periodReturn).toBe(6300)
  expect(aforeRetirementPdfDocument?.extracted?.netReturnIndicator).toBe(6.8)
  expect(aforeRetirementPdfDocument?.extracted?.weeksContributed).toBe(820)
  expect(aforeRetirementPdfDocument?.extracted?.subaccountRows).toBe(2)
  expect(aforeRetirementPdfDocument?.extracted?.subaccountBalanceTotal).toBe(465000)
  expect(aforeRetirementPdfDocument?.extracted?.subaccountPositions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'rcv', balance: 430000, contributions: 18500, withdrawals: 0, periodReturn: 5100 }),
      expect.objectContaining({ name: 'ahorro voluntario', balance: 35000, contributions: 35000, withdrawals: 4000, periodReturn: 1200 }),
    ]),
  )
  expect(aforeRetirementPdfDocument?.extracted?.nssSuffix).toBe('8901')
  expect(aforeRetirementPdfDocument?.extracted?.curpSuffix).toBe('XX00')
  expect(aforeRetirementPdfDocument?.extracted?.subaccounts).toEqual(expect.arrayContaining(['RCV', 'Ahorro voluntario']))
  expect(aforeRetirementPdfDocument?.extracted?.longTermLiquidity).toBe(true)

  await nuPdf.getByRole('button', { name: /Aplicar movimientos revisados/i }).click()
  await expect(page.getByText(/Movimientos revisados aplicados: 8/i)).toBeVisible()
  await expect(nuPdf.getByText(/Movimientos PDF aplicados: 8/i)).toBeVisible()
  await expect(nuPdf.getByRole('button', { name: /Aplicar movimientos revisados/i })).toHaveCount(0)

  const approvedProfilesResponse = await page.request.get('/api/profiles')
  expect(approvedProfilesResponse.ok()).toBe(true)
  const approvedProfilesBody = (await approvedProfilesResponse.json()) as { profiles: FinancialProfile[] }
  const approvedProfile = approvedProfilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'estado-cuenta-nu-cajitas-demo.pdf'),
  )
  const approvedNuDocument = approvedProfile?.importedDocuments.find((document) => document.fileName === 'estado-cuenta-nu-cajitas-demo.pdf')
  expect(approvedNuDocument?.status).toBe('processed')
  expect(approvedNuDocument?.sourceTransactionIds).toHaveLength(8)
  expect(approvedNuDocument?.extracted?.appliedRows).toBe(8)
  expect(approvedNuDocument?.extracted?.reviewedMovementRowsApplied).toBe(8)
  expect(approvedNuDocument?.extracted?.reviewedMovementRowsApproval).toBe('manual_user_action')
  expect(typeof approvedNuDocument?.extracted?.reviewedMovementRowsAppliedAt).toBe('string')
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'NOMINA DEMO' && transaction.type === 'income')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'RETIRO CAJITA' && transaction.type === 'transfer')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'SPEI A CUENTA PROPIA' && transaction.type === 'transfer')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'INTERES CAJITA' && transaction.type === 'income')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'RETIRO ATM' && transaction.type === 'expense')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'NOMINA COMPACTA DEMO' && transaction.type === 'income')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'PAGO TARJETA COMPACTA DEMO' && transaction.type === 'debt_payment')).toHaveLength(1)
  expect(approvedProfile?.transactions.filter((transaction) => transaction.merchant === 'RETIRO ATM COMPACTO' && transaction.type === 'expense')).toHaveLength(1)
  expect(approvedProfile?.accounts.find((account) => account.name.includes('Nu Mexico'))?.balance).toBe(95000)
})

test('deduplicates payroll CFDI against split bank deposits with date and cent tolerance', async ({ page }) => {
  await createCleanProfileForImports(page, 'E2E Nomina split CSV primero')

  const payrollPartialCsv = [
    'Fecha,Descripción,Tipo,Monto,Saldo',
    '2026-06-14,E2E EMPRESA PARCIAL UNO,Depósito,21000.49,21000.49',
    '2026-06-16,E2E EMPRESA PARCIAL DOS,Depósito,20999.50,41999.99',
  ].join('\n')

  const importInput = page.locator('label.drop-zone').locator('input[type="file"]')
  await importInput.setInputFiles([
    {
      name: 'e2e-nomina-parcial.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(payrollPartialCsv),
    },
  ])
  await expect(page.getByText(/1 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })

  await importInput.setInputFiles([
    {
      name: 'e2e-nomina-parcial.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(payrollCfdiXml(42000, '2026-06-15')),
    },
  ])
  await expect(page.getByText(/1 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/no duplica el dashboard/i).first()).toBeVisible()

  const profilesResponse = await page.request.get('/api/profiles')
  expect(profilesResponse.ok()).toBe(true)
  const profilesBody = (await profilesResponse.json()) as { profiles: FinancialProfile[] }
  const importedProfile = profilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'e2e-nomina-parcial.xml'),
  )

  const partialDeposits =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.type === 'income' &&
        transaction.category === 'Nomina' &&
        transaction.merchant.startsWith('E2E EMPRESA PARCIAL'),
    ) ?? []
  expect(partialDeposits).toHaveLength(2)
  expect(Number(partialDeposits.reduce((sum, transaction) => sum + transaction.amount, 0).toFixed(2))).toBe(41999.99)
  expect(
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.type === 'income' &&
        transaction.date === '2026-06-15' &&
        Math.round(transaction.amount * 100) === 4_200_000 &&
        /nomina/i.test(transaction.category),
    ),
  ).toHaveLength(0)

  const bankCsvDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'e2e-nomina-parcial.csv')
  expect(bankCsvDocument?.sourceTransactionIds).toHaveLength(2)
  expect(bankCsvDocument?.extracted?.payrollDepositRows).toBe(2)
  expect(bankCsvDocument?.extracted?.payrollDepositTotal).toBe(41999.99)
  expect(bankCsvDocument?.extracted?.bankReconciliationStatus).toBe('balanced')

  const payrollXmlDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'e2e-nomina-parcial.xml')
  expect(payrollXmlDocument?.kind).toBe('payroll_cfdi')
  expect(payrollXmlDocument?.status).toBe('processed')
  expect(payrollXmlDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(payrollXmlDocument?.extracted?.netIncome).toBe(42000)
  expect(payrollXmlDocument?.extracted?.appliedRows).toBe(0)
  expect(Number(payrollXmlDocument?.extracted?.skippedSemanticDuplicates ?? 0)).toBe(1)
  expect(payrollXmlDocument?.extracted?.dedupeReason).toBe('payroll_semantic_match')
  expect(payrollXmlDocument?.extracted?.matchedTransactionIds).toEqual(expect.arrayContaining(partialDeposits.map((transaction) => transaction.id)))
  expect(payrollXmlDocument?.extracted?.matchedTransactionIds).toHaveLength(2)
})

test('deduplicates split payroll deposits when CFDI was imported first', async ({ page }) => {
  await createCleanProfileForImports(page, 'E2E Nomina split XML primero')

  const payrollPartialCsv = [
    'Fecha,Descripción,Tipo,Monto,Saldo',
    '2026-06-29,E2E EMPRESA INVERSA UNO,Depósito,20000.00,20000.00',
    '2026-07-01,E2E EMPRESA INVERSA DOS,Depósito,22000.00,42000.00',
  ].join('\n')

  const importInput = page.locator('label.drop-zone').locator('input[type="file"]')
  await importInput.setInputFiles([
    {
      name: 'e2e-nomina-primero.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(payrollCfdiXml(42000, '2026-06-30')),
    },
  ])
  await expect(page.getByText(/1 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })

  await importInput.setInputFiles([
    {
      name: 'e2e-nomina-despues.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(payrollPartialCsv),
    },
  ])
  await expect(page.getByText(/1 archivo\(s\) procesados/i)).toBeVisible({ timeout: 30_000 })

  const profilesResponse = await page.request.get('/api/profiles')
  expect(profilesResponse.ok()).toBe(true)
  const profilesBody = (await profilesResponse.json()) as { profiles: FinancialProfile[] }
  const importedProfile = profilesBody.profiles.find((profile) =>
    profile.importedDocuments.some((document) => document.fileName === 'e2e-nomina-despues.csv'),
  )

  const cfdiIncome =
    importedProfile?.transactions.filter(
      (transaction) =>
        transaction.type === 'income' &&
        transaction.date === '2026-06-30' &&
        Math.round(transaction.amount * 100) === 4_200_000 &&
        /nomina/i.test(transaction.category),
    ) ?? []
  expect(cfdiIncome).toHaveLength(1)

  const splitDeposits =
    importedProfile?.transactions.filter((transaction) => transaction.merchant.startsWith('E2E EMPRESA INVERSA') && transaction.type === 'income') ?? []
  expect(splitDeposits).toHaveLength(0)

  const bankCsvDocument = importedProfile?.importedDocuments.find((document) => document.fileName === 'e2e-nomina-despues.csv')
  expect(bankCsvDocument?.status).toBe('processed')
  expect(bankCsvDocument?.sourceTransactionIds ?? []).toHaveLength(0)
  expect(bankCsvDocument?.extracted?.appliedRows).toBe(0)
  expect(Number(bankCsvDocument?.extracted?.skippedSemanticDuplicates ?? 0)).toBe(2)
  expect(bankCsvDocument?.extracted?.dedupeReason).toBe('payroll_semantic_match')
  expect(bankCsvDocument?.extracted?.matchedTransactionIds).toEqual([cfdiIncome[0]?.id, cfdiIncome[0]?.id])
})

test('keeps invalid dates and non-CFDI XML in review without applying movements', async ({ page }) => {
  await page.locator('nav').getByRole('button', { name: 'Documentos' }).click()
  const invalidCsv = [
    'date,amount,merchant,category',
    '2026-99-99,-999,E2E Fecha Invalida,Supermercado',
  ].join('\n')
  const fakeXml = `<?xml version="1.0" encoding="UTF-8"?>
<Comprobante Version="4.0" Fecha="2026-06-15" Total="999.00">
  <Emisor Nombre="XML NO SAT" />
  <Complemento>
    <Nomina FechaPago="2026-06-15" TotalPercepciones="999.00" TotalDeducciones="0.00" />
  </Complemento>
</Comprobante>`

  await page
    .locator('label.drop-zone')
    .locator('input[type="file"]')
    .setInputFiles([
      {
        name: 'e2e-fecha-invalida.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(invalidCsv),
      },
      {
        name: 'e2e-xml-no-sat.xml',
        mimeType: 'application/xml',
        buffer: Buffer.from(fakeXml),
      },
    ])

  await expect(page.getByText(/2 archivo\(s\) procesados/i)).toBeVisible()
  await expect(page.getByText(/0 listo\(s\), 2 para revision/i)).toBeVisible()
  await expect(page.locator('.document-list')).not.toContainText('e2e-fecha-invalida.csv')
  await expect(page.locator('.document-list')).not.toContainText('e2e-xml-no-sat.xml')
  await expect(page.getByTestId('imported-document-card')).toHaveCount(2)
  await expect(page.getByText(/fecha no reconocida/i)).toBeVisible()
  await expect(page.getByText(/No se detecto namespace CFDI\/SAT/i)).toBeVisible()
  await expect(page.getByText(/0 fila\(s\) o conceptos/i)).toBeVisible()
})

test('searches and explains concepts in the knowledge matrix', async ({ page }) => {
  await page.getByRole('button', { name: 'Más' }).click()
  await page.getByRole('button', { name: 'Matriz financiera' }).click()
  await expect(page.getByRole('heading', { name: 'Matriz de conocimiento Mexico' })).toBeVisible()
  await expect(page.getByLabel('Secciones de matriz financiera')).toBeVisible()
  await expect(page.getByLabel('Cobertura de fuentes oficiales')).toContainText('fuentes')
  await expect(page.locator('.knowledge-sources a').first()).toBeVisible()
  for (const section of ['Nomina', 'Tarjetas', 'Bancos / SPEI', 'Nu / SOFIPO', 'GBM', 'Cetes', 'Retiro']) {
    await page.getByTestId('knowledge-section-tab').filter({ hasText: section }).click()
    await expect(page.locator('.import-message')).toContainText(new RegExp(`resultado\\(s\\) en ${section.replace('/', '\\/')}`, 'i'))
  }
  await page.getByTestId('knowledge-section-tab').filter({ hasText: 'Todo' }).click()
  await page.getByRole('textbox', { name: /Buscar concepto/i }).fill('SPEI')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText(/resultado\(s\) en Todo/i)).toBeVisible()

  await page.getByLabel('Explicar texto de cargo / recibo').fill('PAGO MINIMO MSI 03/12 ISR RETENIDO')
  await page.getByRole('button', { name: /Detectar conceptos/i }).click()
  await expect(page.getByRole('heading', { name: 'Conceptos detectados' })).toBeVisible()
})

test('shows privacy controls and local-data messaging', async ({ page }) => {
  await page.getByRole('button', { name: 'Más' }).click()
  await page.getByRole('button', { name: 'Privacidad' }).click()

  await expect(page.getByRole('heading', { name: 'Privacidad operativa' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Datos locales' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Minimizacion' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Siguiente nivel' })).toBeVisible()
})
