'use client'

import { Card, CardContent } from '@/components/ui/card'

interface SummaryColumnProps {
  totalBeds: number
  totalBedsAfterDeductions?: number
  totalPTOnDuty: number
  bedsPerPT: number
}

export function SummaryColumn({
  totalBeds,
  totalBedsAfterDeductions,
  totalPTOnDuty,
  bedsPerPT,
}: SummaryColumnProps) {
  return (
    <Card className="bg-slate-50 border-slate-300 w-fit inline-block">
      <CardContent className="p-1.5 space-y-0.5 text-[11px] leading-tight whitespace-nowrap">
        <div>
          <span className="font-semibold">Total bed counts:</span> {totalBeds}
        </div>
        {typeof totalBedsAfterDeductions === 'number' && (
          <div>
            <span className="font-semibold">After SHS/students:</span> {totalBedsAfterDeductions}
          </div>
        )}
        <div>
          <span className="font-semibold">Total PT:</span> {totalPTOnDuty.toFixed(2)}
        </div>
        <div>
          <span className="font-semibold">Beds/PT:</span> {bedsPerPT.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  )
}
