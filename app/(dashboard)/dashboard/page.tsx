'use client'

import { useState, useEffect, useRef } from 'react'
import { SpecialProgramPanel } from '@/components/dashboard/SpecialProgramPanel'
import { SPTAllocationPanel } from '@/components/dashboard/SPTAllocationPanel'
import { PCAPreferencePanel } from '@/components/dashboard/PCAPreferencePanel'
import { StaffProfilePanel } from '@/components/dashboard/StaffProfilePanel'
import { WardConfigPanel } from '@/components/dashboard/WardConfigPanel'
import { TeamConfigurationPanel } from '@/components/dashboard/TeamConfigurationPanel'
import { AccountManagementPanel } from '@/components/dashboard/AccountManagementPanel'
import { ConfigSyncPanel } from '@/components/dashboard/ConfigSyncPanel'
import { DashboardSidebar, DASHBOARD_CATEGORIES, type CategoryId } from '@/components/dashboard/DashboardSidebar'
import { useAccessControl } from '@/lib/access/useAccessControl'
import type { FeatureId } from '@/lib/access/types'

type PanelType =
  | 'special-programs'
  | 'spt-allocations'
  | 'pca-preferences'
  | 'staff-profile'
  | 'ward-config'
  | 'team-configuration'
  | 'account-management'
  | 'sync-publish'
  | null
type PanelKey = Exclude<PanelType, null>

const categoryLabels: Record<PanelKey, string> = {
  'special-programs': 'Special Programs',
  'spt-allocations': 'SPT Allocations',
  'pca-preferences': 'PCA Preferences',
  'staff-profile': 'Staff Profile',
  'ward-config': 'Ward Config and Bed Stat',
  'team-configuration': 'Team Configuration',
  'account-management': 'Account Management',
  'sync-publish': 'Sync / Publish',
}

const categoryDescriptions: Record<PanelKey, string> = {
  'special-programs': 'Manage special program configurations',
  'spt-allocations': 'Configure SPT allocation settings',
  'pca-preferences': 'Manage PCA preference settings',
  'staff-profile': 'Manage staff records and configurations',
  'ward-config': 'Manage ward names and bed stat',
  'team-configuration': 'Manage team staffing and ward responsibilities',
  'account-management': 'Manage user accounts and access rights',
  'sync-publish': 'Compare and synchronize schedule snapshots with published dashboard configuration',
}

export default function DashboardPage() {
  const access = useAccessControl()
  const [activePanel, setActivePanel] = useState<PanelType>(null)
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

  const featureForCategory = (id: Exclude<CategoryId, null>): FeatureId => {
    switch (id) {
      case 'special-programs':
        return 'dashboard.category.special-programs'
      case 'spt-allocations':
        return 'dashboard.category.spt-allocations'
      case 'pca-preferences':
        return 'dashboard.category.pca-preferences'
      case 'staff-profile':
        return 'dashboard.category.staff-profile'
      case 'ward-config':
        return 'dashboard.category.ward-config'
      case 'team-configuration':
        return 'dashboard.category.team-configuration'
      case 'account-management':
        return 'dashboard.category.account-management'
      case 'sync-publish':
        return 'dashboard.category.sync-publish'
    }
  }

  const visibleCategories = DASHBOARD_CATEGORIES.filter((c) => access.can(featureForCategory(c.id)))

  useEffect(() => {
    if (!activePanel) return
    const allowed = visibleCategories.some((c) => c.id === activePanel)
    if (!allowed) setActivePanel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, access.role, access.settings])

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
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">
            {activePanel ? categoryLabels[activePanel] : 'Dashboard'}
          </h1>
          <p className="text-muted-foreground">
            {activePanel ? categoryDescriptions[activePanel] : 'Configure system settings and preferences'}
          </p>
        </div>

        {/* Content area with smooth scroll - panels handle their own loading states */}
        {activePanel && (
          <div>
            {activePanel === 'special-programs' && <SpecialProgramPanel />}
            {activePanel === 'spt-allocations' && <SPTAllocationPanel />}
            {activePanel === 'pca-preferences' && <PCAPreferencePanel />}
            {activePanel === 'staff-profile' && <StaffProfilePanel />}
            {activePanel === 'ward-config' && <WardConfigPanel />}
            {activePanel === 'team-configuration' && <TeamConfigurationPanel />}
            {activePanel === 'account-management' && <AccountManagementPanel />}
            {activePanel === 'sync-publish' && <ConfigSyncPanel />}
          </div>
        )}
        {!activePanel && (
          <div className="text-center text-muted-foreground py-12">
            {visibleCategories.length > 0
              ? 'Select a category from the sidebar to begin'
              : 'No dashboard sections are enabled for your role. Ask an admin/developer to enable access.'}
          </div>
        )}
      </div>
    </div>
  )
}
