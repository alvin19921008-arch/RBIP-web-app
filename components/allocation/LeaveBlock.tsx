'use client'

import { useState } from 'react'
import { Team, LeaveType } from '@/types/staff'
import { Staff } from '@/types/staff'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'

interface LeaveBlockProps {
  team: Team
  staffOnLeave: (Staff & { leave_type: LeaveType; fteRemaining?: number })[]
  onEditStaff?: (staffId: string) => void
}

interface LeaveItemProps {
  staff: Staff & { leave_type: LeaveType; fteRemaining?: number }
  onEditStaff?: (staffId: string) => void
}

function LeaveItem({ staff, onEditStaff }: LeaveItemProps) {
  const [isHovering, setIsHovering] = useState(false)
  const leaveTypeText = staff.leave_type || 'On Leave'
  
  return (
    <div
      className="text-sm flex items-center justify-between group"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium">{staff.name}</span> -{' '}
        <span className="text-black inline-flex items-center gap-1">
          {leaveTypeText}
          {onEditStaff && isHovering && (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onEditStaff?.(staff.id)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

export function LeaveBlock({ team, staffOnLeave, onEditStaff }: LeaveBlockProps) {
  return (
    <Card>
      <CardContent className="p-2 pt-1">
        <div className="space-y-1">
          {staffOnLeave.map((staff) => (
            <LeaveItem
              key={staff.id}
              staff={staff}
              onEditStaff={onEditStaff}
            />
          ))}
          {staffOnLeave.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              --
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

