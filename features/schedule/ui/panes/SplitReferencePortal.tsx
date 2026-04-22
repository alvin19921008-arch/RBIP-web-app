'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import type { createClientComponentClient } from '@/lib/supabase/client'
import type { Team, Staff } from '@/types/staff'
import type { PCAAllocation, ScheduleCalculations } from '@/types/schedule'
import { combineScheduleCalculations } from '@/lib/features/schedule/scheduleCalculationsCombine'
import { formatDateDDMMYYYY, formatDateForInput, getWeekday, parseDateFromInput } from '@/lib/features/schedule/date'
import { buildDisplayPcaAllocationsByTeam } from '@/lib/features/schedule/pcaDisplayProjection'
import { projectBedRelievingNotesForDisplay } from '@/lib/features/schedule/bedRelievingDisplayProjection'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { useScheduleController } from '@/lib/features/schedule/controller/useScheduleController'
import {
  getContributingTeams,
  getMainTeam,
  getMainTeamDisplayName,
  getVisibleTeams,
  resolveTeamMergeConfig,
  type TeamSettingsMergeRow,
} from '@/lib/utils/teamMerge'
import {
  useSchedulePaneInFlightAbortCleanup,
  useSchedulePaneHydrationEndEffect,
  useSplitReferenceDateLoadEffect,
} from '@/features/schedule/ui/hooks/useSchedulePaneHydration'

const ReferenceSchedulePane = dynamic(
  () => import('@/features/schedule/ui/panes/ReferenceSchedulePane').then((m) => m.ReferenceSchedulePane),
  { ssr: false }
)
const ScheduleBlocks1To6 = dynamic(
  () => import('@/features/schedule/ui/panes/ScheduleBlocks1To6').then((m) => m.ScheduleBlocks1To6),
  { ssr: false }
)

/** Per main team: summed SHS + student placement deductions from contributor teams (display/export). */
type BedCountsShsStudentMergedByTeam = Partial<
  Record<Team, { shsBedCounts: number; studentPlacementBedCounts: number }>
>

type SplitReferenceSupabaseClient = ReturnType<typeof createClientComponentClient>

export function SplitReferencePortal(props: {
  supabase: SplitReferenceSupabaseClient
  refDateParam: string | null
  splitDirection: 'col' | 'row'
  showReference: boolean
  liveTeamSettingsRows: TeamSettingsMergeRow[]
  datesWithData: Set<string>
  holidays: Map<string, string>
  replaceScheduleQuery: (mutate: (params: URLSearchParams) => void) => void
  refPortalHost: HTMLDivElement | null
}) {
  const refInitialDefaultDate = useMemo(() => new Date(), [])
  const refSchedule = useScheduleController({
    defaultDate: refInitialDefaultDate,
    supabase: props.supabase,
    controllerRole: 'ref',
    preserveUnsavedAcrossDateSwitch: false,
  })
  const { state: refScheduleState, actions: refScheduleActions } = refSchedule
  const {
    beginDateTransition: refControllerBeginDateTransition,
    loadAndHydrateDate: refLoadAndHydrateDate,
    _unsafe: refUnsafe,
  } = refScheduleActions
  const { setGridLoading: setRefGridLoading, setIsHydratingSchedule: setRefIsHydratingSchedule } = refUnsafe
  const beginDateTransitionRef = useRef(refControllerBeginDateTransition)
  const loadAndHydrateRef = useRef(refLoadAndHydrateDate)
  const setRefGridLoadingRef = useRef(setRefGridLoading)
  const setRefIsHydratingScheduleRef = useRef(setRefIsHydratingSchedule)
  const statusRef = useRef({ loading: refScheduleState.loading, loadedForDate: refScheduleState.scheduleLoadedForDate })
  const lastRequestedRef = useRef<string | null>(null)
  const inFlightAbortRef = useRef<AbortController | null>(null)

  beginDateTransitionRef.current = refControllerBeginDateTransition
  loadAndHydrateRef.current = refLoadAndHydrateDate
  setRefGridLoadingRef.current = setRefGridLoading
  setRefIsHydratingScheduleRef.current = setRefIsHydratingSchedule

  const setRefIsHydratingScheduleProxy = useCallback((next: boolean) => {
    setRefIsHydratingScheduleRef.current(next)
  }, [])

  useEffect(() => {
    statusRef.current = {
      loading: refScheduleState.loading,
      loadedForDate: refScheduleState.scheduleLoadedForDate,
    }
  }, [refScheduleState.loading, refScheduleState.scheduleLoadedForDate])

  // Split mode: hydrate reference schedule when refDate changes (shared orchestration hook).
  useSplitReferenceDateLoadEffect({
    refDateParam: props.refDateParam,
    parseDateFromInput,
    statusRef,
    lastRequestedRef,
    inFlightAbortRef,
    beginDateTransitionRef,
    loadAndHydrateRef,
    setGridLoadingRef: setRefGridLoadingRef,
  })

  useSchedulePaneInFlightAbortCleanup(inFlightAbortRef)

  // Split mode: the reference controller doesn't include the page-level hydration finalizer
  // used by the main schedule page. Without this, the reference pane can stay stuck on skeleton.
  useSchedulePaneHydrationEndEffect({
    endMode: 'requestAnimationFrame',
    targetDateKey: props.refDateParam,
    isHydratingSchedule: refScheduleState.isHydratingSchedule,
    loading: refScheduleState.loading,
    scheduleLoadedForDate: refScheduleState.scheduleLoadedForDate,
    setIsHydratingSchedule: setRefIsHydratingScheduleProxy,
  })

  const refSelectedDate = refScheduleState.selectedDate
  const refWeekday = getWeekday(refSelectedDate)
  const refDateLabel = formatDateDDMMYYYY(refSelectedDate)
  const refEffectiveTeamMergeConfig = useMemo(
    () =>
      resolveTeamMergeConfig({
        teamSettingsRows: props.liveTeamSettingsRows,
        snapshotMerge: (refScheduleState.baselineSnapshot as any)?.teamMerge ?? null,
        snapshotDisplayNames: (refScheduleState.baselineSnapshot as any)?.teamDisplayNames ?? null,
        hasBaselineSnapshot: !!refScheduleState.baselineSnapshot,
      }),
    [props.liveTeamSettingsRows, refScheduleState.baselineSnapshot]
  )
  const refVisibleTeams = useMemo(
    () => getVisibleTeams(refEffectiveTeamMergeConfig.mergedInto),
    [refEffectiveTeamMergeConfig.mergedInto]
  )
  const refMainTeamDisplayNames = useMemo(() => {
    const out: Partial<Record<Team, string>> = {}
    refVisibleTeams.forEach((mainTeam) => {
      out[mainTeam] = getMainTeamDisplayName({
        mainTeam,
        mergedInto: refEffectiveTeamMergeConfig.mergedInto,
        displayNames: refEffectiveTeamMergeConfig.displayNames,
        mergeLabelOverrideByTeam: refEffectiveTeamMergeConfig.mergeLabelOverrideByTeam,
      })
    })
    return out
  }, [refVisibleTeams, refEffectiveTeamMergeConfig])
  const refContributorsByMain = useMemo(() => {
    const out: Partial<Record<Team, Team[]>> = {}
    refVisibleTeams.forEach((mainTeam) => {
      out[mainTeam] = getContributingTeams(mainTeam, refEffectiveTeamMergeConfig.mergedInto)
    })
    return out
  }, [refVisibleTeams, refEffectiveTeamMergeConfig.mergedInto])
  const refTherapistAllocationsForDisplay = useMemo(() => {
    const out = createEmptyTeamRecordFactory<any[]>(() => [])
    refVisibleTeams.forEach((mainTeam) => {
      const contributors = refContributorsByMain[mainTeam] || [mainTeam]
      out[mainTeam] = contributors.flatMap((team) => refScheduleState.therapistAllocations[team] || [])
    })
    return out
  }, [refVisibleTeams, refContributorsByMain, refScheduleState.therapistAllocations])
  const refPcaDisplayAllocationsByTeam = useMemo(
    () =>
      buildDisplayPcaAllocationsByTeam({
        selectedDate: refSelectedDate,
        staff: [...refScheduleState.staff, ...refScheduleState.bufferStaff],
        staffOverrides: refScheduleState.staffOverrides as any,
        pcaAllocationsByTeam: refScheduleState.pcaAllocations as Record<Team, Array<PCAAllocation & { staff?: Staff }>>,
      }),
    [
      refSelectedDate,
      refScheduleState.staff,
      refScheduleState.bufferStaff,
      refScheduleState.staffOverrides,
      refScheduleState.pcaAllocations,
    ]
  )
  const refPcaAllocationsForDisplay = useMemo(() => {
    const out = createEmptyTeamRecordFactory<any[]>(() => [])
    refVisibleTeams.forEach((mainTeam) => {
      const contributors = refContributorsByMain[mainTeam] || [mainTeam]
      out[mainTeam] = contributors.flatMap((team) => refPcaDisplayAllocationsByTeam[team] || [])
    })
    return out
  }, [refVisibleTeams, refContributorsByMain, refPcaDisplayAllocationsByTeam])
  const refCalculationsForDisplay = useMemo(() => {
    const out = createEmptyTeamRecord<ScheduleCalculations | null>(null)
    refVisibleTeams.forEach((mainTeam) => {
      const contributors = refContributorsByMain[mainTeam] || [mainTeam]
      out[mainTeam] = combineScheduleCalculations(
        contributors.map((team) => refScheduleState.calculations[team])
      )
    })
    return out
  }, [refVisibleTeams, refContributorsByMain, refScheduleState.calculations])
  const refBedCountsOverridesByTeamForDisplay = useMemo(() => {
    const out: BedCountsShsStudentMergedByTeam = {}
    refVisibleTeams.forEach((mainTeam) => {
      const contributors = refContributorsByMain[mainTeam] || [mainTeam]
      let shsTotal = 0
      let studentTotal = 0
      let hasAny = false
      contributors.forEach((team) => {
        const override = refScheduleState.bedCountsOverridesByTeam?.[team] ?? null
        if (override && typeof override.shsBedCounts === 'number') {
          shsTotal += override.shsBedCounts
          hasAny = true
        }
        if (override && typeof override.studentPlacementBedCounts === 'number') {
          studentTotal += override.studentPlacementBedCounts
          hasAny = true
        }
      })
      if (hasAny) {
        out[mainTeam] = {
          shsBedCounts: shsTotal,
          studentPlacementBedCounts: studentTotal,
        }
      }
    })
    return out
  }, [refVisibleTeams, refContributorsByMain, refScheduleState.bedCountsOverridesByTeam])
  const refBedRelievingNotesByToTeamForDisplay = useMemo(() => {
    return projectBedRelievingNotesForDisplay({
      bedRelievingNotesByToTeam: refScheduleState.bedRelievingNotesByToTeam,
      mergedInto: refEffectiveTeamMergeConfig.mergedInto,
    })
  }, [refScheduleState.bedRelievingNotesByToTeam, refEffectiveTeamMergeConfig.mergedInto])
  const refBedAllocationsForDisplay = useMemo(() => {
    const mapped = (refScheduleState.bedAllocations || []).map((allocation) => ({
      ...allocation,
      from_team: getMainTeam(allocation.from_team, refEffectiveTeamMergeConfig.mergedInto),
      to_team: getMainTeam(allocation.to_team, refEffectiveTeamMergeConfig.mergedInto),
    }))
    return mapped.filter((allocation) => allocation.from_team !== allocation.to_team)
  }, [refScheduleState.bedAllocations, refEffectiveTeamMergeConfig.mergedInto])

  const referencePaneNode = (
    <ReferenceSchedulePane
      direction={props.splitDirection}
      refHidden={!props.showReference}
      disableBlur={true}
      showTeamHeader={true}
      teams={refVisibleTeams}
      teamDisplayNames={refMainTeamDisplayNames}
      refDateLabel={refDateLabel}
      selectedDate={refSelectedDate}
      datesWithData={props.datesWithData}
      holidays={props.holidays}
      onSelectDate={(d) => {
        const key = formatDateForInput(d)
        try {
          window.sessionStorage.setItem('rbip_split_ref_date', key)
        } catch {
          // ignore
        }
        props.replaceScheduleQuery((p) => {
          p.set('split', '1')
          p.set('refDate', key)
          p.set('refHidden', '0')
        })
      }}
      onToggleDirection={() => {
        const next = props.splitDirection === 'col' ? 'row' : 'col'
        try {
          window.sessionStorage.setItem('rbip_split_dir', next)
        } catch {
          // ignore
        }
        props.replaceScheduleQuery((p) => {
          p.set('split', '1')
          p.set('splitDir', next)
          p.set('refHidden', '0')
        })
      }}
      onRetract={() => {
        try {
          window.sessionStorage.setItem('rbip_split_ref_hidden', '1')
        } catch {
          // ignore
        }
        props.replaceScheduleQuery((p) => {
          p.set('split', '1')
          p.set('refHidden', '1')
        })
      }}
    >
      {refScheduleState.isHydratingSchedule ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="h-4 w-48 rounded-md bg-muted animate-pulse" />
          <div className="mt-2 h-28 rounded-md bg-muted/70 animate-pulse" />
        </div>
      ) : (
        <ScheduleBlocks1To6
          mode="reference"
          teams={refVisibleTeams}
          weekday={refWeekday}
          sptAllocations={refScheduleState.sptAllocations as any}
          specialPrograms={refScheduleState.specialPrograms as any}
          therapistAllocationsByTeam={refTherapistAllocationsForDisplay as any}
          pcaAllocationsByTeam={refPcaAllocationsForDisplay as any}
          bedAllocations={refBedAllocationsForDisplay as any}
          wards={refScheduleState.wards as any}
          calculationsByTeam={refCalculationsForDisplay as any}
          staff={refScheduleState.staff as any}
          staffOverrides={refScheduleState.staffOverrides as any}
          bedCountsOverridesByTeam={refBedCountsOverridesByTeamForDisplay}
          bedRelievingNotesByToTeam={refBedRelievingNotesByToTeamForDisplay as any}
          stepStatus={refScheduleState.stepStatus as any}
          initializedSteps={refScheduleState.initializedSteps as any}
        />
      )}
    </ReferenceSchedulePane>
  )

  if (!props.showReference) return null
  return props.refPortalHost ? createPortal(referencePaneNode, props.refPortalHost) : null
}
