const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  formatters.set(timeZone, formatter)
  return formatter
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function civilDate(date = new Date(), timeZone = localTimeZone()): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('La fecha civil no es valida.')

  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, part.value]),
  )

  if (!parts.year || !parts.month || !parts.day) throw new RangeError('No se pudo calcular la fecha civil.')
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function civilMonth(date = new Date(), timeZone = localTimeZone()): string {
  return civilDate(date, timeZone).slice(0, 7)
}
