'use client'

import { useState } from 'react'
import { SpecialProgramPanel } from '@/components/dashboard/SpecialProgramPanel'
import { SPTAllocationPanel } from '@/components/dashboard/SPTAllocationPanel'
import { PCAPreferencePanel } from '@/components/dashboard/PCAPreferencePanel'
import { UnmetPCANeedsCard } from '@/components/dashboard/UnmetPCANeedsCard'
import { StaffProfilePanel } from '@/components/dashboard/StaffProfilePanel'
import { WardConfigPanel } from '@/components/dashboard/WardConfigPanel'
import { TeamConfigurationPanel } from '@/components/dashboard/TeamConfigurationPanel'
import { DashboardSidebar, type CategoryId } from '@/components/dashboard/DashboardSidebar'

type PanelType = 'special-programs' | 'spt-allocations' | 'pca-preferences' | 'pca-unmet-needs' | 'staff-profile' | 'ward-config' | 'team-configuration' | null
type PanelKey = Exclude<PanelType, null>

const categoryLabels: Record<PanelKey, string> = {
  'special-programs': 'Special Programs',
  'spt-allocations': 'SPT Allocations',
  'pca-preferences': 'PCA Preferences',
  'pca-unmet-needs': 'PCA Unmet Needs Tracking',
  'staff-profile': 'Staff Profile',
  'ward-config': 'Ward Config and Bed Stat',
  'team-configuration': 'Team Configuration',
}

const categoryDescriptions: Record<PanelKey, string> = {
  'special-programs': 'Manage special program configurations',
  'spt-allocations': 'Configure SPT allocation settings',
  'pca-preferences': 'Manage PCA preference settings',
  'pca-unmet-needs': 'Track and view unmet PCA needs',
  'staff-profile': 'Manage staff records and configurations',
  'ward-config': 'Manage ward names and bed counts',
  'team-configuration': 'Manage team staffing and ward responsibilities',
}

export default function DashboardPage() {
  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const handleCategoryChange = (category: CategoryId) => {
    setActivePanel(category)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <DashboardSidebar
        activeCategory={activePanel}
        onCategoryChange={handleCategoryChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
            {activePanel === 'pca-unmet-needs' && (
              <div>
                <UnmetPCANeedsCard />
              </div>
            )}
            {activePanel === 'staff-profile' && <StaffProfilePanel />}
            {activePanel === 'ward-config' && <WardConfigPanel />}
            {activePanel === 'team-configuration' && <TeamConfigurationPanel />}
          </div>
        )}
        {!activePanel && (
          <div className="text-center text-muted-foreground py-12">
            Select a category from the sidebar to begin
          </div>
        )}
      </div>
    </div>
  )
}
