import type { Status } from './types'

export function statusLabel(status: Status) {
  return status === 'green' ? 'Bien' : status === 'yellow' ? 'Atencion' : 'Riesgo'
}
