'use client'

import { useState } from 'react'
import { Staff } from '@/types/staff'
import { StaffCard } from './StaffCard'
import { InactiveStaffPool } from './InactiveStaffPool'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react'

interface StaffPoolProps {
  therapists: Staff[]
  pcas: Staff[]
  inactiveStaff?: Staff[]
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
}

export function StaffPool({ therapists, pcas, inactiveStaff = [], onEditStaff }: StaffPoolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedRanks, setExpandedRanks] = useState<Record<string, boolean>>({
    SPT: false,
    APPT: false,
    RPT: false,
    PCA: false,
  })

  const therapistsByRank = {
    SPT: therapists.filter(t => t.rank === 'SPT'),
    APPT: therapists.filter(t => t.rank === 'APPT'),
    RPT: therapists.filter(t => t.rank === 'RPT'),
  }

  const handleShowAll = () => {
    setExpandedRanks({
      SPT: true,
      APPT: true,
      RPT: true,
      PCA: true,
    })
  }

  const toggleRank = (rank: string) => {
    setExpandedRanks(prev => ({
      ...prev,
      [rank]: !prev[rank]
    }))
  }

  // If collapsed, show only a button to expand
  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="h-8 px-2 flex items-center gap-1"
        title="Show Staff Pool"
      >
        <ChevronRight className="h-4 w-4" />
        <span className="text-xs">Staff Pool</span>
      </Button>
    )
  }

  return (
    <div className="w-40 space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(false)}
          className="h-6 w-6 p-0"
          title="Hide Staff Pool"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleShowAll}
          className="text-xs h-6 px-2"
        >
          Show All
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Therapist Pool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(therapistsByRank).map(([rank, staffList]) => (
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
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">PCA Pool</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => toggleRank('PCA')}
            className="flex items-center gap-1 text-xs font-semibold mb-1 hover:text-primary transition-colors"
          >
            {expandedRanks.PCA ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            PCA
          </button>
          {expandedRanks.PCA && (
            <div className="space-y-1 ml-4">
              {pcas.map((pca) => (
                <StaffCard
                  key={pca.id}
                  staff={pca}
                  onEdit={() => onEditStaff?.(pca.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {inactiveStaff.length > 0 && (
        <InactiveStaffPool inactiveStaff={inactiveStaff} onEditStaff={onEditStaff} />
      )}
    </div>
  )
}

