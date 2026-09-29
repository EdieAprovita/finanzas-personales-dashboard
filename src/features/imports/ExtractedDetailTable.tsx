import type { ReactNode } from 'react'
import {
  formatExtractedValue,
  isSensitiveDetailField,
  type ExtractedDetailColumn,
} from './documentPresentation'

interface ExtractedDetailTableProps {
  title: string
  rows: Array<Record<string, unknown>>
  columns: ExtractedDetailColumn[]
}

export function ExtractedDetailTable({
  title,
  rows,
  columns,
}: ExtractedDetailTableProps): ReactNode {
  if (!rows.length) return null

  return (
    <details className="document-detail-table" data-testid="document-detail-table" data-detail-title={title}>
      <summary>
        <span>{title}</span>
        <strong>{rows.length} partida(s)</strong>
      </summary>
      <div className="document-detail-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {isSensitiveDetailField(column.key)
                      ? 'Dato protegido'
                      : formatExtractedValue(column.key, row[column.key]) || '--'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
