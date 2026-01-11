'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'

interface SummaryColumnProps {
  totalBeds: number
  totalBedsAfterDeductions?: number
  totalShsBeds?: number
  totalStudentBeds?: number
  totalPTOnDuty: number
  totalPTBufferOnDuty?: number
  totalPTLeaveFteCost?: number
  totalPTSickLeaveFteCost?: number
  totalPCAOnDuty: number
  totalPCABufferOnDuty?: number
  totalPCALeaveFteCost?: number
  totalPCASickLeaveFteCost?: number
  bedsPerPT: number
}

export function SummaryColumn({
  totalBeds,
  totalBedsAfterDeductions,
  totalShsBeds,
  totalStudentBeds,
  totalPTOnDuty,
  totalPTBufferOnDuty,
  totalPTLeaveFteCost,
  totalPTSickLeaveFteCost,
  totalPCAOnDuty,
  totalPCABufferOnDuty,
  totalPCALeaveFteCost,
  totalPCASickLeaveFteCost,
  bedsPerPT,
}: SummaryColumnProps) {
  const pcaRegular = totalPCAOnDuty
  const pcaBuffer = typeof totalPCABufferOnDuty === 'number' ? totalPCABufferOnDuty : 0
  const hasPCABuffer = pcaBuffer > 0.0001

  const ptRegular = totalPTOnDuty
  const ptBuffer = typeof totalPTBufferOnDuty === 'number' ? totalPTBufferOnDuty : 0
  const hasPTBuffer = ptBuffer > 0.0001

  const ptLeaveFte = typeof totalPTLeaveFteCost === 'number' ? totalPTLeaveFteCost : 0
  const ptSickLeaveFte = typeof totalPTSickLeaveFteCost === 'number' ? totalPTSickLeaveFteCost : 0
  const pcaLeaveFte = typeof totalPCALeaveFteCost === 'number' ? totalPCALeaveFteCost : 0
  const pcaSickLeaveFte = typeof totalPCASickLeaveFteCost === 'number' ? totalPCASickLeaveFteCost : 0

  const shsBeds = typeof totalShsBeds === 'number' ? totalShsBeds : 0
  const studentBeds = typeof totalStudentBeds === 'number' ? totalStudentBeds : 0
  const hasShsOrStudentsBreakdown = shsBeds > 0 || studentBeds > 0

  return (
    <Card className="bg-slate-50 border-slate-300 w-fit inline-block">
      <CardContent className="p-1.5 space-y-0.5 text-[11px] leading-tight whitespace-nowrap">
        <div>
          <span className="font-semibold">Total bed counts:</span> {totalBeds}
        </div>
        {typeof totalBedsAfterDeductions === 'number' && (
          <div className="flex items-center gap-1">
            <span className="font-semibold">After SHS/students:</span>
            {hasShsOrStudentsBreakdown ? (
              <Tooltip
                side="top"
                content={
                  <div className="text-xs whitespace-pre-line">
                    {`SHS: ${shsBeds}\nStudent: ${studentBeds}`}
                  </div>
                }
              >
                <span className="cursor-default">{totalBedsAfterDeductions}</span>
              </Tooltip>
            ) : (
              <span>{totalBedsAfterDeductions}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="font-semibold">Total PT:</span>
          <Tooltip
            side="top"
            content={
              <div className="text-xs whitespace-pre-line">
                {`Regular PT: ${ptRegular.toFixed(2)}\nBuffer PT: ${ptBuffer.toFixed(2)}\nLeave: ${ptLeaveFte.toFixed(2)}\nSick leave: ${ptSickLeaveFte.toFixed(2)}`}
              </div>
            }
          >
            <span className="cursor-default">
              {hasPTBuffer ? `${ptRegular.toFixed(2)} + ${ptBuffer.toFixed(2)}` : ptRegular.toFixed(2)}
            </span>
          </Tooltip>
        </div>
        {hasPCABuffer ? (
          <div className="flex items-center gap-1">
            <span className="font-semibold">Total PCA:</span>
            <Tooltip
              side="top"
              content={
                <div className="text-xs whitespace-pre-line">
                {`Regular PCA: ${pcaRegular.toFixed(2)}\nBuffer PCA: ${pcaBuffer.toFixed(2)}\nLeave: ${pcaLeaveFte.toFixed(2)}\nSick leave: ${pcaSickLeaveFte.toFixed(2)}`}
                </div>
              }
            >
              <span className="cursor-default">
                {pcaRegular.toFixed(2)} + {pcaBuffer.toFixed(2)}
              </span>
            </Tooltip>
          </div>
        ) : (
          <div>
            <span className="font-semibold">Total PCA:</span> {pcaRegular.toFixed(2)}
          </div>
        )}
        <div>
          <span className="font-semibold">Beds/PT:</span> {bedsPerPT.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  )
}
