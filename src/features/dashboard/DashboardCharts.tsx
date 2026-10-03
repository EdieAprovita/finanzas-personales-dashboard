import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { mxn, type FinancialMetrics } from '../../domain/finance'
import type { FinancialProfile, MonthlySnapshot } from '../../domain/types'
import { ChartDataTable, ChartFrame } from './DashboardPrimitives'

const colors = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#4b5563',
]

type HistoryWindow = 'six' | 'all'
type SnapshotWithCashFlow = MonthlySnapshot & { cashFlow: number }

interface DashboardChartsProps {
  profile: FinancialProfile
  metrics: FinancialMetrics
  latestMonth: string
  historyWindow: HistoryWindow
  selectedBudgetCategory: string | null
  onHistoryWindowChange: (window: HistoryWindow) => void
  onSelectedBudgetCategoryChange: (category: string | null) => void
}

export function DashboardCharts({
  profile,
  metrics,
  latestMonth,
  historyWindow,
  selectedBudgetCategory,
  onHistoryWindowChange,
  onSelectedBudgetCategoryChange,
}: DashboardChartsProps) {
  const historyData = useMemo<SnapshotWithCashFlow[]>(
    () =>
      [...profile.monthlySnapshots]
        .sort((left, right) => left.month.localeCompare(right.month))
        .slice(historyWindow === 'six' ? -6 : 0)
        .map((snapshot) => ({
          ...snapshot,
          cashFlow: snapshot.income - snapshot.expenses - snapshot.debtPayments,
        })),
    [historyWindow, profile.monthlySnapshots],
  )
  const budgetChartData = selectedBudgetCategory
    ? metrics.categorySpend.filter((row) => row.category === selectedBudgetCategory)
    : metrics.categorySpend
  const selectedBudget = selectedBudgetCategory
    ? metrics.budgetProgress.find((row) => row.category === selectedBudgetCategory)
    : null

  return (
    <>
      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <h2>Flujo, ahorro y patrimonio</h2>
            <p>
              Compara ingresos, gasto, flujo y patrimonio. Periodo activo: {latestMonth}.
            </p>
          </div>
          <strong>{mxn(metrics.netWorth)}</strong>
        </div>
        <div className="finance-chart-toolbar">
          <div role="group" aria-label="Rango del historial financiero">
            <button
              type="button"
              className={historyWindow === 'six' ? 'active' : ''}
              aria-pressed={historyWindow === 'six'}
              onClick={() => onHistoryWindowChange('six')}
            >
              Ultimos 6 meses
            </button>
            <button
              type="button"
              className={historyWindow === 'all' ? 'active' : ''}
              aria-pressed={historyWindow === 'all'}
              onClick={() => onHistoryWindowChange('all')}
            >
              Todo el historial
            </button>
          </div>
          {metrics.cashFlowForecast.monthsAnalyzed > 0 && (
            <p>
              Proyeccion descriptiva:{' '}
              <strong>{mxn(metrics.cashFlowForecast.projectedCashFlow)}</strong> de
              flujo con promedio de {metrics.cashFlowForecast.monthsAnalyzed} mes(es).
            </p>
          )}
        </div>

        <ChartFrame className="chart-lg" label="Historial de ingreso, gasto, flujo y patrimonio">
          {({ width, height }) => (
            <ComposedChart
              width={width}
              height={height}
              data={historyData}
              margin={{ top: 8, right: 10, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="flow"
                tickFormatter={(value) => `${Number(value) / 1000}k`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="netWorth"
                orientation="right"
                tickFormatter={(value) => `${Number(value) / 1000}k`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip formatter={(value) => mxn(Number(value))} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: '#475569' }}
              />
              <ReferenceLine yAxisId="flow" y={0} stroke="#94a3b8" />
              <Bar
                yAxisId="flow"
                dataKey="income"
                fill="#2563eb"
                name="Ingreso"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="flow"
                dataKey="expenses"
                fill="#f97316"
                name="Gasto"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="cashFlow"
                stroke="#059669"
                strokeWidth={3}
                dot={{ r: 3 }}
                name="Flujo"
              />
              <Line
                yAxisId="netWorth"
                type="monotone"
                dataKey="netWorth"
                stroke="#7c3aed"
                strokeWidth={3}
                dot={false}
                name="Patrimonio"
              />
              {historyWindow === 'all' && historyData.length > 6 && (
                <Brush dataKey="month" height={24} stroke="#94a3b8" />
              )}
            </ComposedChart>
          )}
        </ChartFrame>

        <ChartDataTable
          label="Datos mensuales de flujo y patrimonio"
          columns={['Mes', 'Ingreso', 'Gasto', 'Flujo', 'Patrimonio']}
          rows={historyData.map((row) => [
            row.month,
            mxn(row.income),
            mxn(row.expenses),
            mxn(row.cashFlow),
            mxn(row.netWorth),
          ])}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Gasto por categoria</h2>
            <p>
              {selectedBudget
                ? `${selectedBudget.category}: ${selectedBudget.remaining >= 0 ? 'disponible' : 'excedido'} ${mxn(Math.abs(selectedBudget.remaining))}.`
                : 'Contra presupuesto mensual.'}
            </p>
          </div>
        </div>

        {metrics.budgetProgress.length > 0 && (
          <div className="budget-filter" role="group" aria-label="Filtrar gasto por categoria">
            <button
              type="button"
              className={selectedBudgetCategory === null ? 'active' : ''}
              aria-pressed={selectedBudgetCategory === null}
              onClick={() => onSelectedBudgetCategoryChange(null)}
            >
              Todas
            </button>
            {metrics.budgetProgress.slice(0, 6).map((row) => (
              <button
                type="button"
                key={row.category}
                className={
                  selectedBudgetCategory === row.category ? 'active' : row.status
                }
                aria-pressed={selectedBudgetCategory === row.category}
                onClick={() => onSelectedBudgetCategoryChange(row.category)}
              >
                {row.category}
              </button>
            ))}
          </div>
        )}

        <ChartFrame className="chart-md" label="Gasto y presupuesto por categoría">
          {({ width, height }) => (
            <BarChart width={width} height={height} data={budgetChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="category" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(value) => `${Number(value) / 1000}k`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip formatter={(value) => mxn(Number(value))} />
              <Bar
                dataKey="amount"
                name="Gasto"
                radius={[4, 4, 0, 0]}
                fill="#2563eb"
              />
              <Bar
                dataKey="budget"
                name="Presupuesto"
                radius={[4, 4, 0, 0]}
                fill="#94a3b8"
              />
            </BarChart>
          )}
        </ChartFrame>

        <ChartDataTable
          label="Datos de gasto por categoría"
          columns={['Categoría', 'Gasto', 'Presupuesto']}
          rows={budgetChartData.map((row) => [
            row.category,
            mxn(row.amount),
            mxn(row.budget),
          ])}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Mix de gasto</h2>
            <p>Lectura rapida del mes actual.</p>
          </div>
        </div>

        <ChartFrame className="chart-md" label="Distribución del gasto por categoría">
          {({ width, height }) => (
            <PieChart width={width} height={height}>
              <Pie
                data={metrics.categorySpend}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="45%"
                outerRadius={92}
                innerRadius={54}
                paddingAngle={2}
              >
                {metrics.categorySpend.map((entry, index) => (
                  <Cell key={entry.category} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: '#64748b' }}
              />
              <Tooltip formatter={(value) => mxn(Number(value))} />
            </PieChart>
          )}
        </ChartFrame>

        <ChartDataTable
          label="Datos del mix de gasto"
          columns={['Categoría', 'Gasto']}
          rows={metrics.categorySpend.map((entry) => [entry.category, mxn(entry.amount)])}
        />
      </section>
    </>
  )
}
