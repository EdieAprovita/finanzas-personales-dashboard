import { describe, expect, it } from 'vitest'
import { decodeCsvBytes } from './csvText'
import { parseMoney } from './normalization'

describe('decodeCsvBytes', () => {
  it('keeps UTF-8 CSV exports intact and removes a byte-order mark', () => {
    const bytes = new TextEncoder().encode('\ufeffFecha,Descripción\n2026-06-01,Nómina')

    expect(decodeCsvBytes(bytes)).toBe('Fecha,Descripción\n2026-06-01,Nómina')
  })

  it('falls back to Windows-1252 when a bank export is not valid UTF-8', () => {
    const bytes = new Uint8Array([70, 101, 99, 104, 97, 44, 68, 101, 115, 99, 114, 105, 112, 99, 105, 243, 110])

    expect(decodeCsvBytes(bytes)).toBe('Fecha,Descripción')
  })

  it('decodes UTF-16LE and UTF-16BE exports from spreadsheet tools', () => {
    const utf16Le = new Uint8Array([0xff, 0xfe, 0x46, 0x00, 0x65, 0x00, 0x63, 0x00, 0x68, 0x00, 0x61, 0x00])
    const utf16Be = new Uint8Array([0xfe, 0xff, 0x00, 0x46, 0x00, 0x65, 0x00, 0x63, 0x00, 0x68, 0x00, 0x61])

    expect(decodeCsvBytes(utf16Le)).toBe('Fecha')
    expect(decodeCsvBytes(utf16Be)).toBe('Fecha')
  })
})

describe('parseMoney', () => {
  it('preserves CR and DR direction markers from bank exports', () => {
    expect(parseMoney('1,250.00 DR')).toBe(-1250)
    expect(parseMoney('500.00 CR')).toBe(500)
  })
})
