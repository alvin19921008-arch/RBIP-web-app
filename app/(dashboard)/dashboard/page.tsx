'use client'

import { useState, useEffect, useRef, type ComponentType } from 'react'
import dynamic from 'next/dynamic'
import { CircleHelp } from 'lucide-react'
import { DashboardSidebar, DASHBOARD_CATEGORIES, type CategoryId } from '@/components/dashboard/DashboardSidebar'
import { useAccessControl } from '@/lib/access/useAccessControl'
import type { FeatureId } from '@/lib/access/types'
import { Button } from '@/components/ui/button'
import { HelpCenterDialog } from '@/components/help/HelpCenterDialog'
import { HELP_TOUR_PENDING_KEY } from '@/lib/help/tours'
import { startHelpTourWithRetry } from '@/lib/help/startTour'

type PanelKey = Exclude<CategoryId, null>

const SpecialProgramPanel = dynamic(
  () => import('@/components/dashboard/SpecialProgramPanel').then(m => m.SpecialProgramPanel),
  { ssr: false }
)
const SPTAllocationPanel = dynamic(
  () => import('@/components/dashboard/SPTAllocationPanel').then(m => m.SPTAllocationPanel),
  { ssr: false }
)
const PCAPreferencePanel = dynamic(
  () => import('@/components/dashboard/PCAPreferencePanel').then(m => m.PCAPreferencePanel),
  { ssr: false }
)
const StaffProfilePanel = dynamic(
  () => import('@/components/dashboard/StaffProfilePanel').then(m => m.StaffProfilePanel),
  { ssr: false }
)
const WardConfigPanel = dynamic(
  () => import('@/components/dashboard/WardConfigPanel').then(m => m.WardConfigPanel),
  { ssr: false }
)
const TeamConfigurationPanel = dynamic(
  () => import('@/components/dashboard/TeamConfigurationPanel').then(m => m.TeamConfigurationPanel),
  { ssr: false }
)
const AccountManagementPanel = dynamic(
  () => import('@/components/dashboard/AccountManagementPanel').then(m => m.AccountManagementPanel),
  { ssr: false }
)
const ConfigSyncPanel = dynamic(
  () => import('@/components/dashboard/ConfigSyncPanel').then(m => m.ConfigSyncPanel),
  { ssr: false }
)

const CATEGORY_LABELS = Object.fromEntries(
  DASHBOARD_CATEGORIES.map(category => [category.id, category.label])
) as Record<PanelKey, string>

const PANEL_CONFIG: Record<
  PanelKey,
  { description: string; featureId: FeatureId; Component: ComponentType }
> = {
  'special-programs': {
    description: 'Manage special program configurations',
    featureId: 'dashboard.category.special-programs',
    Component: SpecialProgramPanel,
  },
  'spt-allocations': {
    description: 'Configure SPT allocation settings',
    featureId: 'dashboard.category.spt-allocations',
    Component: SPTAllocationPanel,
  },
  'pca-preferences': {
    description: 'Manage PCA preference settings',
    featureId: 'dashboard.category.pca-preferences',
    Component: PCAPreferencePanel,
  },
  'staff-profile': {
    description: 'Manage staff records and configurations',
    featureId: 'dashboard.category.staff-profile',
    Component: StaffProfilePanel,
  },
  'ward-config': {
    description: 'Manage ward names and bed stat',
    featureId: 'dashboard.category.ward-config',
    Component: WardConfigPanel,
  },
  'team-configuration': {
    description: 'Manage team staffing and ward responsibilities',
    featureId: 'dashboard.category.team-configuration',
    Component: TeamConfigurationPanel,
  },
  'account-management': {
    description: 'Manage user accounts and access rights',
    featureId: 'dashboard.category.account-management',
    Component: AccountManagementPanel,
  },
  'sync-publish': {
    description: 'Compare and synchronize schedule snapshots with published dashboard configuration',
    featureId: 'dashboard.category.sync-publish',
    Component: ConfigSyncPanel,
  },
}

export default function DashboardPage() {
  const access = useAccessControl()
  const [activePanel, setActivePanel] = useState<CategoryId>(null)
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [topLoadingVisible, setTopLoadingVisible] = useState(false)
  const [topLoadingProgress, setTopLoadingProgress] = useState(0)
  const loadingBarIntervalRef = useRef<number | null>(null)
  const loadingBarHideTimeoutRef = useRef<number | null>(null)

  const startTopLoading = (initialProgress: number = 0.05) => {
    if (loadingBarHideTimeoutRef.current) {
      window.clearTimeout(loadingBarHideTimeoutRef.current)
      loadingBarHideTimeoutRef.current = null
    }
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
    setTopLoadingVisible(true)
    setTopLoadingProgress(Math.max(0, Math.min(1, initialProgress)))
  }

  const bumpTopLoadingTo = (target: number) => {
    setTopLoadingProgress(prev => Math.max(prev, Math.max(0, Math.min(1, target))))
  }

  const startSoftAdvance = (cap: number = 0.9) => {
    if (loadingBarIntervalRef.current) return
    loadingBarIntervalRef.current = window.setInterval(() => {
      setTopLoadingProgress(prev => {
        const max = Math.max(prev, Math.min(0.98, cap))
        if (prev >= max) return prev
        const step = Math.min(0.015 + Math.random() * 0.02, max - prev)
        return prev + step
      })
    }, 180)
  }

  const stopSoftAdvance = () => {
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
  }

  const finishTopLoading = () => {
    stopSoftAdvance()
    bumpTopLoadingTo(1)
    loadingBarHideTimeoutRef.current = window.setTimeout(() => {
      setTopLoadingVisible(false)
      setTopLoadingProgress(0)
      loadingBarHideTimeoutRef.current = null
    }, 350)
  }

  useEffect(() => {
    // Show loading bar on initial page load
    startTopLoading(0.1)
    startSoftAdvance(0.6)
    // Simulate page initialization
    const timer = setTimeout(() => {
      stopSoftAdvance()
      bumpTopLoadingTo(0.95)
      finishTopLoading()
    }, 300)

    return () => {
      clearTimeout(timer)
      if (loadingBarIntervalRef.current) window.clearInterval(loadingBarIntervalRef.current)
      if (loadingBarHideTimeoutRef.current) window.clearTimeout(loadingBarHideTimeoutRef.current)
    }
  }, [])

  const handleCategoryChange = (category: CategoryId) => {
    // Show loading bar when switching panels
    startTopLoading(0.1)
    startSoftAdvance(0.7)
    setActivePanel(category)
    // Finish loading after a brief delay (panels handle their own loading states)
    setTimeout(() => {
      stopSoftAdvance()
      bumpTopLoadingTo(0.95)
      finishTopLoading()
    }, 200)
  }

  const featureForCategory = (id: PanelKey): FeatureId => PANEL_CONFIG[id].featureId

  const visibleCategories = DASHBOARD_CATEGORIES.filter((c) => access.can(featureForCategory(c.id)))
  const activePanelConfig = activePanel ? PANEL_CONFIG[activePanel] : null

  useEffect(() => {
    if (!activePanel) return
    const allowed = visibleCategories.some((c) => c.id === activePanel)
    if (!allowed) setActivePanel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, access.role, access.settings])

  useEffect(() => {
    try {
      const pending = window.localStorage.getItem(HELP_TOUR_PENDING_KEY)
      if (pending !== 'dashboard-admin') return
      window.localStorage.removeItem(HELP_TOUR_PENDING_KEY)
      window.setTimeout(() => {
        void startHelpTourWithRetry('dashboard-admin')
      }, 220)
    } catch {
      // ignore pending-tour errors
    }
  }, [])

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Thin top loading bar */}
      {topLoadingVisible && (
        <div className="fixed top-0 left-0 right-0 h-[6px] z-[99999] bg-transparent">
          <div
            className="h-full bg-sky-500 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(topLoadingProgress * 100)}%` }}
          />
        </div>
      )}
      <DashboardSidebar
        activeCategory={activePanel}
        onCategoryChange={handleCategoryChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        categories={visibleCategories}
      />
      <div className="flex-1 overflow-auto p-6" style={{ scrollBehavior: 'smooth' as const }}>
        {/* Header section - dynamic based on selection */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {activePanel ? CATEGORY_LABELS[activePanel] : 'Dashboard'}
            </h1>
            <p className="text-muted-foreground">
              {activePanel ? activePanelConfig?.description : 'Configure system settings and preferences'}
            </p>
          </div>
          <Button variant="outline" type="button" onClick={() => setHelpDialogOpen(true)} data-tour="dashboard-help">
            <CircleHelp className="h-4 w-4 mr-1.5" />
            Help
          </Button>
        </div>

        {/* Content area with smooth scroll - panels handle their own loading states */}
        {activePanelConfig ? (
          <div>
            <activePanelConfig.Component />
          </div>
        ) : null}
        {!activePanel && (
          <div className="text-center text-muted-foreground py-12">
            {access.loading ? (
              <div className="space-y-2">
                <div className="text-sm">Loading dashboard permissions…</div>
                <div className="text-xs text-muted-foreground">Fetching access settings.</div>
              </div>
            ) : access.status === 'error' ? (
              <div className="space-y-3">
                <div className="text-sm text-destructive">Failed to load access settings.</div>
                {access.error ? <div className="text-xs text-muted-foreground">{access.error}</div> : null}
                <div>
                  <Button type="button" variant="outline" onClick={() => access.reload()}>
                    Retry
                  </Button>
                </div>
              </div>
            ) : visibleCategories.length > 0 ? (
              'Select a category from the sidebar to begin'
            ) : (
              'No dashboard sections are enabled for your role. Ask an admin/developer to enable access.'
            )}
          </div>
        )}
        <HelpCenterDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
      </div>
    </div>
  )
}
