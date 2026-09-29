import type { FinancialMetrics } from '../../domain/finance'
import type { FinancialProfile } from '../../domain/types'

export interface DashboardProps {
  profile: FinancialProfile
  metrics: FinancialMetrics
  reportingPeriod: string
  onReportingPeriodChange: (period: string) => void
  onStartCapture: () => void
  onCreateFromDocuments: () => void
  onOpenPlanning: () => void
}
