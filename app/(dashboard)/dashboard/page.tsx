'use client'

import { useState } from 'react'
import { SpecialProgramPanel } from '@/components/dashboard/SpecialProgramPanel'
import { SPTAllocationPanel } from '@/components/dashboard/SPTAllocationPanel'
import { PCAPreferencePanel } from '@/components/dashboard/PCAPreferencePanel'
import { UnmetPCANeedsCard } from '@/components/dashboard/UnmetPCANeedsCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PanelType = 'special-programs' | 'spt-allocations' | 'pca-preferences' | null

export default function DashboardPage() {
  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [unmetNeedsExpanded, setUnmetNeedsExpanded] = useState(false)

  const panels = [
    { id: 'special-programs' as PanelType, label: 'Special Programs', component: SpecialProgramPanel },
    { id: 'spt-allocations' as PanelType, label: 'SPT Allocations', component: SPTAllocationPanel },
    { id: 'pca-preferences' as PanelType, label: 'PCA Preferences', component: PCAPreferencePanel },
  ]

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Configure system settings and preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {panels.map((panel) => {
          const Component = panel.component
          return (
            <Card
              key={panel.id}
              className={`cursor-pointer hover:border-primary ${
                activePanel === panel.id ? 'border-primary' : ''
              }`}
              onClick={() => setActivePanel(activePanel === panel.id ? null : panel.id)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{panel.label}</CardTitle>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card
          className={`cursor-pointer hover:border-primary ${
            unmetNeedsExpanded ? 'border-primary lg:col-span-4' : ''
          }`}
          onClick={() => setUnmetNeedsExpanded(!unmetNeedsExpanded)}
        >
          <CardHeader>
            <CardTitle className="text-lg">PCA Unmet Needs Tracking</CardTitle>
          </CardHeader>
          {unmetNeedsExpanded && (
            <CardContent>
              <UnmetPCANeedsCard />
            </CardContent>
          )}
        </Card>
      </div>

      {activePanel && (
        <div className="mt-6">
          {activePanel === 'special-programs' && <SpecialProgramPanel />}
          {activePanel === 'spt-allocations' && <SPTAllocationPanel />}
          {activePanel === 'pca-preferences' && <PCAPreferencePanel />}
        </div>
      )}
    </div>
  )
}
