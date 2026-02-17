'use client'

import type { ReactNode } from 'react'

export function ScheduleDialogsLayer(props: {
  bedCountsDialog: ReactNode
  staffEditDialog: ReactNode
  step1LeaveSetupDialog: ReactNode
  tieBreakDialog: ReactNode
  copyWizardDialog: ReactNode
  floatingPcaDialog: ReactNode
  specialProgramOverrideDialog: ReactNode
  sptFinalEditDialog: ReactNode
  nonFloatingSubstitutionDialog: ReactNode
  calendarPopover: ReactNode
}) {
  return (
    <>
      {props.bedCountsDialog}
      {props.staffEditDialog}
      {props.step1LeaveSetupDialog}
      {props.tieBreakDialog}
      {props.copyWizardDialog}
      {props.floatingPcaDialog}
      {props.specialProgramOverrideDialog}
      {props.sptFinalEditDialog}
      {props.nonFloatingSubstitutionDialog}
      {props.calendarPopover}
    </>
  )
}

