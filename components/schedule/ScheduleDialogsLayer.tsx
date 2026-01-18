'use client'

import type { ReactNode } from 'react'

export function ScheduleDialogsLayer(props: {
  bedCountsDialog: ReactNode
  staffEditDialog: ReactNode
  tieBreakDialog: ReactNode
  copyWizardDialog: ReactNode
  floatingPcaDialog: ReactNode
  specialProgramOverrideDialog: ReactNode
  nonFloatingSubstitutionDialog: ReactNode
  calendarPopover: ReactNode
}) {
  return (
    <>
      {props.bedCountsDialog}
      {props.staffEditDialog}
      {props.tieBreakDialog}
      {props.copyWizardDialog}
      {props.floatingPcaDialog}
      {props.specialProgramOverrideDialog}
      {props.nonFloatingSubstitutionDialog}
      {props.calendarPopover}
    </>
  )
}

