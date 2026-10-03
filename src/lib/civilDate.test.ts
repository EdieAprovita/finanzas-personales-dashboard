import { describe, expect, it } from 'vitest'
import { civilDate, civilMonth } from './civilDate'

describe('civilDate', () => {
  it('conserva el cierre de mes de Ciudad de Mexico antes de medianoche local', () => {
    const instant = new Date('2026-07-01T05:30:00.000Z')
    expect(civilDate(instant, 'America/Mexico_City')).toBe('2026-06-30')
    expect(civilMonth(instant, 'America/Mexico_City')).toBe('2026-06')
  })

  it('cambia de dia y mes despues de medianoche local', () => {
    const instant = new Date('2026-07-01T06:30:00.000Z')
    expect(civilDate(instant, 'America/Mexico_City')).toBe('2026-07-01')
    expect(civilMonth(instant, 'America/Mexico_City')).toBe('2026-07')
  })

  it('conserva correctamente el cierre de anio', () => {
    expect(civilDate(new Date('2027-01-01T05:59:59.000Z'), 'America/Mexico_City')).toBe('2026-12-31')
    expect(civilDate(new Date('2027-01-01T06:00:00.000Z'), 'America/Mexico_City')).toBe('2027-01-01')
  })
})
