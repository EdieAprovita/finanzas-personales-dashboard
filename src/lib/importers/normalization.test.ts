import { describe, expect, it } from 'vitest'
import { normalizeDate } from './normalization'

describe('normalizeDate', () => {
  it('parses Mexican abbreviated month dates separated by hyphens', () => {
    expect(normalizeDate('06-Abr-2026')).toBe('2026-04-06')
    expect(normalizeDate('7-Mar-2026')).toBe('2026-03-07')
    expect(normalizeDate('01/jun./2026')).toBe('2026-06-01')
  })
})
