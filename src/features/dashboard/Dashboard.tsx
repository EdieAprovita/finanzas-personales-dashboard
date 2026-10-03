import { useMemo, useState } from 'react'
import { profileFacts } from '../profiles/profileSummary'
import { DashboardCharts } from './DashboardCharts'
import { DashboardReportSummary } from './DashboardReportSummary'
import { EmptyDashboard } from './EmptyDashboard'
import type { DashboardProps } from './dashboardTypes'

export function Dashboard({
  profile,
  metrics,
  reportingPeriod,
  onReportingPeriodChange,
  onCloseReportingPeriod,
  onStartCapture,
  onCreateFromDocuments,
  onOpenPlanning,
}: DashboardProps) {
  const [historyWindow, setHistoryWindow] = useState<'six' | 'all'>('six')
  const [selectedBudgetCategory, setSelectedBudgetCategory] = useState<string | null>(null)
  const facts = useMemo(() => profileFacts(profile), [profile])
  const periods = [...new Set(profile.monthlySnapshots.map((snapshot) => snapshot.month))]
    .sort()
    .reverse()

  if (facts.isEmpty) {
    return (
      <EmptyDashboard
        profileName={profile.name}
        onStartCapture={onStartCapture}
        onCreateFromDocuments={onCreateFromDocuments}
        onOpenPlanning={onOpenPlanning}
      />
    )
  }

  return (
    <div className="dashboard-grid">
      <DashboardReportSummary
        key={reportingPeriod}
        profile={profile}
        metrics={metrics}
        periods={periods}
        reportingPeriod={reportingPeriod}
        facts={facts}
        onReportingPeriodChange={onReportingPeriodChange}
        onCloseReportingPeriod={onCloseReportingPeriod}
        onCreateFromDocuments={onCreateFromDocuments}
        onOpenPlanning={onOpenPlanning}
      />
      <DashboardCharts
        profile={profile}
        metrics={metrics}
        latestMonth={facts.latestMonth}
        historyWindow={historyWindow}
        selectedBudgetCategory={selectedBudgetCategory}
        onHistoryWindowChange={setHistoryWindow}
        onSelectedBudgetCategoryChange={setSelectedBudgetCategory}
      />
    </div>
  )
}
