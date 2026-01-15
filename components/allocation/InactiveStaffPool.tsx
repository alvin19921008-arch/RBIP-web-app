'use client'

import { useState } from 'react'
import { Staff } from '@/types/staff'
import { StaffCard } from './StaffCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface InactiveStaffPoolProps {
  inactiveStaff: Staff[]
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
  staffOverrides?: Record<string, { leaveType?: any; fteRemaining?: number; fteSubtraction?: number }>
}

export function InactiveStaffPool({ inactiveStaff, onEditStaff, staffOverrides = {} }: InactiveStaffPoolProps) {
  const [expandedRanks, setExpandedRanks] = useState<Record<string, boolean>>({
    SPT: false,
    APPT: false,
    RPT: false,
    PCA: false,
  })

  // Helper function to calculate Base_FTE-remaining
  const getBaseFTERemaining = (staffId: string): number => {
    const override = staffOverrides[staffId]
    if (override?.fteSubtraction !== undefined) {
      return Math.max(0, 1.0 - override.fteSubtraction)
    }
    return 1.0
  }

  // Sort staff by rank: SPT -> APPT -> RPT -> PCA
  const sortStaffByRank = (staffList: Staff[]): Staff[] => {
    const rankOrder: Record<string, number> = { SPT: 0, APPT: 1, RPT: 2, PCA: 3 }
    return [...staffList].sort((a, b) => {
      const orderA = rankOrder[a.rank] ?? 999
      const orderB = rankOrder[b.rank] ?? 999
      return orderA - orderB
    })
  }

  const staffByRank = {
    SPT: sortStaffByRank(inactiveStaff.filter(s => s.rank === 'SPT')),
    APPT: sortStaffByRank(inactiveStaff.filter(s => s.rank === 'APPT')),
    RPT: sortStaffByRank(inactiveStaff.filter(s => s.rank === 'RPT')),
    PCA: sortStaffByRank(inactiveStaff.filter(s => s.rank === 'PCA')),
  }

  const toggleRank = (rank: string) => {
    setExpandedRanks(prev => ({
      ...prev,
      [rank]: !prev[rank]
    }))
  }

  if (inactiveStaff.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-1 pt-2">
        <CardTitle className="text-sm">Inactive Staff Pool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-1">
        {Object.entries(staffByRank).map(([rank, staffList]) => {
          if (staffList.length === 0) return null
          
          return (
            <div key={rank}>
              <button
                onClick={() => toggleRank(rank)}
                className="flex items-center gap-1 text-xs font-semibold mb-1 hover:text-primary transition-colors"
              >
                {expandedRanks[rank] ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {rank}
              </button>
              {expandedRanks[rank] && (
                <div className="space-y-1 ml-4">
                  {staffList.map((staff) => {
                    const baseFTE = getBaseFTERemaining(staff.id)
                    const showFTE = staff.rank !== 'SPT' && (baseFTE > 0 && baseFTE < 1 || baseFTE === 0)
                    return (
                    <StaffCard
                      key={staff.id}
                      staff={staff}
                      useDragOverlay={true}
                      onEdit={(e) => onEditStaff?.(staff.id, e)}
                      draggable={false}
                        fteRemaining={showFTE ? baseFTE : undefined}
                        showFTE={showFTE}
                    />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
