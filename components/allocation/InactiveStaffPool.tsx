'use client'

import { useState } from 'react'
import { Staff } from '@/types/staff'
import { StaffCard } from './StaffCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface InactiveStaffPoolProps {
  inactiveStaff: Staff[]
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
}

export function InactiveStaffPool({ inactiveStaff, onEditStaff }: InactiveStaffPoolProps) {
  const [expandedRanks, setExpandedRanks] = useState<Record<string, boolean>>({
    SPT: false,
    APPT: false,
    RPT: false,
    PCA: false,
  })

  const staffByRank = {
    SPT: inactiveStaff.filter(s => s.rank === 'SPT'),
    APPT: inactiveStaff.filter(s => s.rank === 'APPT'),
    RPT: inactiveStaff.filter(s => s.rank === 'RPT'),
    PCA: inactiveStaff.filter(s => s.rank === 'PCA'),
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
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Inactive Staff Pool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
                  {staffList.map((staff) => (
                    <StaffCard
                      key={staff.id}
                      staff={staff}
                      onEdit={(e) => onEditStaff?.(staff.id, e)}
                      draggable={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
