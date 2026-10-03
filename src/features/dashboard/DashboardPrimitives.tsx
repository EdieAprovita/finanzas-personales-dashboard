import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ChartSize {
  width: number
  height: number
}

interface ChartFrameProps {
  className: string
  label: string
  children: (size: ChartSize) => ReactNode
}

export function ChartFrame({ className, label, children }: ChartFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 })

  useEffect(() => {
    const element = frameRef.current
    if (!element) return

    const measuredElement = element
    const updateSize = () => {
      setSize({
        width: Math.max(0, Math.floor(measuredElement.clientWidth)),
        height: Math.max(0, Math.floor(measuredElement.clientHeight)),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className={className} aria-label={label}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  )
}

interface ChartDataTableProps {
  label: string
  columns: string[]
  rows: Array<Array<string | number>>
}

export function ChartDataTable({ label, columns, rows }: ChartDataTableProps) {
  return (
    <details className="chart-data-details">
      <summary>Ver datos en tabla</summary>
      <div className="chart-data-scroll">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${label}-${index}`}>
                {row.map((value, valueIndex) => (
                  <td key={`${label}-${index}-${valueIndex}`}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
