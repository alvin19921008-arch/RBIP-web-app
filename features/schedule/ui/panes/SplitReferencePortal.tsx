'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import type { Team, Staff } from '@/types/staff'
import type { PCAAllocation, ScheduleCalculations } from '@/types/schedule'
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

function combineScheduleCalculations(rows: Array<ScheduleCalculations | null | undefined>): ScheduleCalculations | null {
  const valid = rows.filter((row): row is ScheduleCalculations => !!row)
  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  const first = valid[0]
  const designated = Array.from(new Set(valid.flatMap((v) => v.designated_wards || [])))
  const sum = (selector: (c: ScheduleCalculations) => number | undefined) =>
    valid.reduce((acc, row) => acc + (selector(row) || 0), 0)

  const totalBedsDesignated = sum((c) => c.total_beds_designated)
  const totalBeds = sum((c) => c.total_beds)
  const ptPerTeam = sum((c) => c.pt_per_team)
  const totalPtPerTeam = sum((c) => c.total_pt_per_team)
  const bedsForRelieving = sum((c) => c.beds_for_relieving)
  const pcaOnDuty = sum((c) => c.pca_on_duty)
  const avgPcaPerTeam = sum((c) => c.average_pca_per_team)
  const baseAvgPcaPerTeam = sum((c) => c.base_average_pca_per_team || 0)
  const requiredPcaPerTeam = sum((c) => c.required_pca_per_team || 0)
  const expectedBedsPerTeam = sum((c) => c.expected_beds_per_team || 0)

  return {
    ...first,
    designated_wards: designated,
    total_beds_designated: totalBedsDesignated,
    total_beds: totalBeds,
    pt_per_team: ptPerTeam,
    total_pt_per_team: totalPtPerTeam,
    beds_for_relieving: bedsForRelieving,
    pca_on_duty: pcaOnDuty,
    average_pca_per_team: avgPcaPerTeam,
    base_average_pca_per_team: baseAvgPcaPerTeam,
    required_pca_per_team: requiredPcaPerTeam,
    expected_beds_per_team: expectedBedsPerTeam,
    // Keep globals from first row (these should be identical across teams in current model).
    total_pt_on_duty: first.total_pt_on_duty,
    beds_per_pt: first.beds_per_pt,
    total_pt_per_pca: first.total_pt_per_pca,
  }
}

export function SplitReferencePortal(props: {
  supabase: any
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

  useEffect(() => {
    statusRef.current = {
      loading: refScheduleState.loading,
      loadedForDate: refScheduleState.scheduleLoadedForDate,
    }
  }, [refScheduleState.loading, refScheduleState.scheduleLoadedForDate])

  // Split mode: hydrate reference schedule when refDate changes.
  useEffect(() => {
    if (!props.refDateParam) return

    try {
      window.sessionStorage.setItem('rbip_split_ref_date', props.refDateParam)
    } catch {
      // ignore
    }

    const status = statusRef.current
    if (status.loadedForDate === props.refDateParam && !status.loading) {
      lastRequestedRef.current = props.refDateParam
      return
    }

    // Guard against duplicate retriggers for the same date while a load is in flight.
    if (lastRequestedRef.current === props.refDateParam && status.loading) {
      return
    }

    let parsed: Date
    try {
      parsed = parseDateFromInput(props.refDateParam)
    } catch {
      return
    }

    inFlightAbortRef.current?.abort()
    const ac = new AbortController()
    inFlightAbortRef.current = ac
    lastRequestedRef.current = props.refDateParam
    beginDateTransitionRef.current(parsed, { resetLoadedForDate: true })
    void (async () => {
      try {
        await loadAndHydrateRef.current({ date: parsed, signal: ac.signal })
      } finally {
        if (!ac.signal.aborted) {
          // Unlike the main schedule page, the reference pane doesn't have the page-level
          // gridLoading finalizer effect; ensure this doesn't get stuck true.
          setRefGridLoadingRef.current(false)
        }
      }
    })()
    return () => {
      ac.abort()
      if (inFlightAbortRef.current === ac) inFlightAbortRef.current = null
    }
  }, [props.refDateParam])

  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort()
    }
  }, [])

  // Split mode: the reference controller doesn't include the page-level hydration finalizer
  // effect used by the main schedule page. Without this, the reference pane can remain
  // stuck showing its skeleton forever.
  useEffect(() => {
    if (!props.refDateParam) return
    if (!refScheduleState.isHydratingSchedule) return
    if (refScheduleState.loading) return
    if (refScheduleState.scheduleLoadedForDate !== props.refDateParam) return

    // End hydration on next frame to ensure load-driven state updates have flushed.
    try {
      window.requestAnimationFrame(() => setRefIsHydratingScheduleRef.current(false))
    } catch {
      setRefIsHydratingScheduleRef.current(false)
    }
  }, [
    props.refDateParam,
    refScheduleState.isHydratingSchedule,
    refScheduleState.loading,
    refScheduleState.scheduleLoadedForDate,
  ])

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
