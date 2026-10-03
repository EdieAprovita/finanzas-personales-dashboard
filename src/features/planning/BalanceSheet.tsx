import { Landmark } from 'lucide-react'
import type { ReactNode } from 'react'
import { buildBalanceSheet } from '../../domain/balanceSheet'
import { mxn, pct } from '../../domain/finance'
import type { FinancialProfile } from '../../domain/types'

function linesOrEmpty(lines: ReturnType<typeof buildBalanceSheet>['assets'], empty: string): ReactNode {
  if (!lines.length) return <p className="balance-sheet-empty">{empty}</p>

  return (
    <ul className="balance-sheet-lines">
      {lines.map((line) => (
        <li key={`${line.group}-${line.label}`}>
          <span>{line.label}</span>
          <strong>{mxn(line.value)}</strong>
        </li>
      ))}
    </ul>
  )
}

export function BalanceSheet({ profile }: { profile: FinancialProfile }): ReactNode {
  const sheet = buildBalanceSheet(profile)
  const liabilitiesToAssets = sheet.totalAssets > 0
    ? sheet.totalLiabilities / sheet.totalAssets
    : Number.NaN

  return (
    <section className="panel wide balance-sheet">
      <div className="panel-heading">
        <div>
          <h2>Balance patrimonial</h2>
          <p>Foto actual de activos menos pasivos. Solo reúne datos confirmados en este perfil.</p>
        </div>
        <Landmark size={24} />
      </div>
      <div className="goal-summary-grid" aria-label="Resumen del patrimonio">
        <article>
          <span>Patrimonio neto</span>
          <strong>{mxn(sheet.netWorth)}</strong>
          <small>Activos totales menos todos los pasivos.</small>
        </article>
        <article>
          <span>Patrimonio líquido</span>
          <strong>{mxn(sheet.liquidNetWorth)}</strong>
          <small>Efectivo, ahorros y cuentas por cobrar menos pasivos.</small>
        </article>
        <article>
          <span>Pasivos / activos</span>
          <strong>{Number.isFinite(liabilitiesToAssets) ? pct(liabilitiesToAssets) : 'Sin datos'}</strong>
          <small>Menos de 35% es una referencia favorable; no sustituye el contexto de cada deuda.</small>
        </article>
      </div>
      <div className="balance-sheet-grid">
        <section>
          <h3>Activos · {mxn(sheet.totalAssets)}</h3>
          {linesOrEmpty(sheet.assets, 'Agrega cuentas, bienes o inversiones para formar tu balance.')}
        </section>
        <section>
          <h3>Pasivos · {mxn(sheet.totalLiabilities)}</h3>
          {linesOrEmpty(sheet.liabilities, 'No hay pasivos registrados en la moneda de este perfil.')}
        </section>
      </div>
      <p className="balance-sheet-note">No se calcula plusvalía ni una evolución histórica hasta que registres valoraciones fechadas en meses consecutivos.</p>
    </section>
  )
}
