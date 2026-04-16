'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Staff, Team, LeaveType } from '@/types/staff'
import type { Weekday } from '@/types/staff'
import type { SpecialProgram, SPTAllocation } from '@/types/allocation'
import type { PCAAllocation, TherapistAllocation, ScheduleCalculations, ScheduleStepId } from '@/types/schedule'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip } from '@/components/ui/tooltip'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateForInput } from '@/lib/features/schedule/date'
import { serializeDevLeaveSimBundle, parseDevLeaveSimBundle } from '@/lib/dev/leaveSim/bundle'
import { getSptWeekdayConfigMap } from '@/lib/features/schedule/sptConfig'
import { generateDevLeaveSimDraft } from '@/lib/dev/leaveSim/generator'
import { sampleLeaveSimQuotas } from '@/lib/dev/leaveSim/sampleLeaveSimQuotas'
import {
  ALL_SLOTS,
  clampNumber,
  defaultDevLeaveSimConfig,
  isValidSlot,
  type DevLeaveSimConfig,
  type DevLeaveSimDebugBundle,
  type DevLeaveSimDraft,
  type DevLeaveSimStaffPatch,
} from '@/lib/dev/leaveSim/types'
import { runDevLeaveSimInvariants, type DevLeaveSimInvariantReport } from '@/lib/dev/leaveSim/invariants'
import { TEAMS } from '@/lib/features/schedule/constants'

export type LeaveSimStepMode = 'automatic' | 'interactive'

function buildStep3HarnessTeamOrder(args: {
  visibleTeams: Team[]
  pendingPerTeam: Partial<Record<Team, number>> | undefined
}): { teamOrder: Team[]; pendingForV1: Record<Team, number> } {
  const runtimeTeams = args.visibleTeams.length > 0 ? args.visibleTeams : TEAMS
  const pendingForV1 = {} as Record<Team, number>
  for (const t of TEAMS) {
    const raw = args.pendingPerTeam?.[t]
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    pendingForV1[t] = runtimeTeams.includes(t) ? n : 0
  }
  const teamOrder = [...runtimeTeams].sort((a, b) => {
    const d = (pendingForV1[b] || 0) - (pendingForV1[a] || 0)
    if (d !== 0) return d
    return runtimeTeams.indexOf(a) - runtimeTeams.indexOf(b)
  })
  return { teamOrder, pendingForV1 }
}

function MiniStepModePicker(props: {
  value: LeaveSimStepMode
  onChange: (next: LeaveSimStepMode) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-background p-0.5">
      <button
        type="button"
        disabled={props.disabled}
        className={cn(
          'rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
          props.value === 'automatic' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => props.onChange('automatic')}
      >
        Automatic
      </button>
      <button
        type="button"
        disabled={props.disabled}
        className={cn(
          'rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
          props.value === 'interactive' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => props.onChange('interactive')}
      >
        Interactive
      </button>
    </div>
  )
}

function MiniStepRow(props: {
  title: string
  helper: string
  value: LeaveSimStepMode
  onChange: (next: LeaveSimStepMode) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 pr-2">
        <div className="text-xs font-medium text-foreground">{props.title}</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{props.helper}</p>
      </div>
      <MiniStepModePicker value={props.value} onChange={props.onChange} disabled={props.disabled} />
    </div>
  )
}

const LEAVE_TYPE_OPTIONS: LeaveType[] = [
  null,
  'VL',
  'half day VL',
  'TIL',
  'half day TIL',
  'SDO',
  'sick leave',
  'study leave',
  'medical follow-up',
  'others',
]

type StaffOverrideLike = Record<
  string,
  {
    leaveType?: LeaveType | null
    fteRemaining?: number
    fteSubtraction?: number
    availableSlots?: number[]
    invalidSlots?: Array<{ slot: 1 | 2 | 3 | 4; timeRange: { start: string; end: string } }>
    invalidSlot?: 1 | 2 | 3 | 4
  }
>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pcaSlotFteFromAvailableSlots(availableSlots: unknown): number {
  if (!Array.isArray(availableSlots)) return 0
  const uniq = Array.from(new Set(availableSlots)).filter((s) => isValidSlot(s))
  return round2(clampNumber(uniq.length * 0.25, 0, 1.0))
}

function safeNumberInput(v: string, fallback: number): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function patchToOverride(
  p: DevLeaveSimStaffPatch,
  sptBaseFteMap?: Record<string, number>,
): StaffOverrideLike[string] {
  const inv = p.invalidSlots?.[0]?.slot
  const availableSlots = Array.isArray(p.availableSlots) ? p.availableSlots.filter((s) => isValidSlot(s)) : undefined
  const invalidSlots = Array.isArray(p.invalidSlots) ? p.invalidSlots.filter((x) => isValidSlot(x.slot)) : undefined
  const filteredSlots = inv && availableSlots ? availableSlots.filter((s) => s !== inv) : availableSlots
  const derivedPcaFteRemaining = p.rank === 'PCA' ? pcaSlotFteFromAvailableSlots(filteredSlots) : p.fteRemaining

  // For SPT staff the generator always produces fteRemaining/fteSubtraction relative to a base
  // of 1.0, because it doesn't know the configured SPT FTE. Re-scale to the real base here so
  // that Step 1.2's buildDraftRow infers the correct sptBaseFTE.
  if (p.rank === 'SPT' && sptBaseFteMap) {
    const realBase = sptBaseFteMap[p.staffId] ?? 0
    if (realBase > 0 && realBase <= 1) {
      // p.fteRemaining is a fraction of 1.0 → scale to realBase
      const scaledRemaining = round2(clampNumber(p.fteRemaining * realBase, 0, realBase))
      const scaledSubtraction = round2(clampNumber(realBase - scaledRemaining, 0, realBase))
      return {
        leaveType: p.leaveType,
        fteRemaining: scaledRemaining,
        fteSubtraction: scaledSubtraction,
        availableSlots: filteredSlots,
        invalidSlots,
        invalidSlot: inv,
      }
    }
  }

  return {
    leaveType: p.leaveType,
    fteRemaining: derivedPcaFteRemaining,
    fteSubtraction: p.rank === 'PCA' ? round2(1 - derivedPcaFteRemaining) : p.fteSubtraction,
    availableSlots: filteredSlots,
    invalidSlots,
    // Legacy single-slot marker used by the PCA algorithm (controller will also derive when needed)
    invalidSlot: inv,
  }
}

function buildOverridesFromDraft(
  draft: DevLeaveSimDraft | null,
  sptBaseFteMap?: Record<string, number>,
): StaffOverrideLike {
  const next: StaffOverrideLike = {}
  if (!draft) return next
  for (const p of draft.patches || []) {
    next[p.staffId] = patchToOverride(p, sptBaseFteMap)
  }
  return next
}

function getLocalKey(dateKey: string): string {
  return `rbip_dev_leave_sim:${dateKey}`
}

export type DevLeaveSimPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void

  userRole: 'developer' | 'admin' | 'user'
  selectedDate: Date
  selectedDateKey: string
  weekday: Weekday

  staff: Staff[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]

  staffOverrides: StaffOverrideLike
  setStaffOverrides: (next: StaffOverrideLike) => void

  clearDomainFromStep: (stepId: ScheduleStepId) => void
  goToStep: (stepId: ScheduleStepId) => void
  setInitializedSteps: (next: Set<string>) => void
  setStepStatus: (next: Record<string, 'pending' | 'completed' | 'modified'>) => void
  setStep2Result: (next: any) => void
  setHasSavedAllocations: (next: boolean) => void
  setTieBreakDecisions: (next: any) => void

  recalculateScheduleCalculations: () => void

  /** Used to show Step 2.3 row only when the real Step 2 stepper would include it. */
  showSharedTherapistStep?: boolean
  /** Latest pending PCA FTE per team (for V1 headless + harness copy). */
  pendingPCAFTEPerTeam?: Partial<Record<Team, number>>
  visibleTeams?: Team[]

  runStep2: (args: { cleanedOverrides?: any; toast?: (title: string, variant?: any, description?: string) => void }) => Promise<any>
  /**
   * Harness Step 2 runner. Flag names follow legacy controller wiring:
   * - autoStep21: automatic Step 2.0 (keep overrides / hybrid) vs interactive dialog
   * - autoStep20: automatic Step 2.1 substitutions vs interactive wizard
   * - autoStep22: automatic Step 2.2 (no SPT final edit dialog)
   * - autoStep23: automatic Step 2.3 (no shared-therapist dialog)
   */
  runStep2Auto?: (args: { autoStep20: boolean; autoStep21: boolean; autoStep22: boolean; autoStep23: boolean }) => Promise<void>
  runStep3: (args: {
    onTieBreak?: (params: { teams: Team[]; pendingFTE: number; tieBreakKey: string }) => Promise<Team>
    userTeamOrder?: Team[]
    userAdjustedPendingFTE?: Record<Team, number>
  }) => Promise<void>
  /** Headless Step 3 v2 pass (Floating PCA v2 allocator), standard mode only in harness. */
  runStep3V2Auto?: (args: { autoStep32: boolean; autoStep33: boolean; bufferPreAssignRatio: number }) => Promise<void>
  /** Optional: open the actual Step 3 wizard UI (3.0→3.4). */
  openStep3Wizard?: () => void
  runStep4: () => Promise<void>

  therapistAllocationsByTeam: Record<Team, Array<TherapistAllocation & { staff: Staff }>>
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff: Staff }>>
  calculationsByTeam: Record<Team, ScheduleCalculations | null>
}

export function DevLeaveSimPanel(props: DevLeaveSimPanelProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'run' | 'bundle'>('edit')
  const [config, setConfig] = useState<DevLeaveSimConfig>(() => defaultDevLeaveSimConfig())
  const [draft, setDraft] = useState<DevLeaveSimDraft | null>(null)
  const [appliedOriginalsByStaffId, setAppliedOriginalsByStaffId] = useState<Record<string, any> | null>(null)
  const [importText, setImportText] = useState('')
  const [report, setReport] = useState<DevLeaveSimInvariantReport | null>(null)
  const [clearTieBreakDecisions, setClearTieBreakDecisions] = useState(true)
  const [isRunningSteps, setIsRunningSteps] = useState(false)
  const [step2Mode20, setStep2Mode20] = useState<LeaveSimStepMode>('automatic')
  const [step2Mode21, setStep2Mode21] = useState<LeaveSimStepMode>('automatic')
  const [step2Mode22, setStep2Mode22] = useState<LeaveSimStepMode>('automatic')
  const [step2Mode23, setStep2Mode23] = useState<LeaveSimStepMode>('automatic')
  const [step3Engine, setStep3Engine] = useState<'v2' | 'v1'>('v2')
  /** V1 on-schedule wizard only (standard vs balanced). Headless V1 run ignores this. */
  const [step3V1WizardAllocationMode, setStep3V1WizardAllocationMode] = useState<'standard' | 'balanced'>('standard')
  const [step3Mode30, setStep3Mode30] = useState<LeaveSimStepMode>('automatic')
  const [step3Mode32, setStep3Mode32] = useState<LeaveSimStepMode>('automatic')
  const [step3Mode33, setStep3Mode33] = useState<LeaveSimStepMode>('automatic')
  // 0..1 ratio of buffer PCA slots to pre-assign in "Step 3.0" (before 3.1).
  const [step30BufferPreAssignRatio, setStep30BufferPreAssignRatio] = useState(0)
  const [pipelinePhase, setPipelinePhase] = useState<null | 'step2' | 'step3' | 'step4' | 'invariants'>(null)
  const draftPatchesTopRef = useRef<HTMLDivElement | null>(null)

  // Numeric inputs should allow free typing (incl. empty string), then normalize on blur.
  const [plannedTherapistCountInput, setPlannedTherapistCountInput] = useState<string>(() => String(config.plannedTherapistCount))
  const [plannedPcaBudgetInput, setPlannedPcaBudgetInput] = useState<string>(() => String(config.plannedPcaFteBudget))
  const [sickCountInput, setSickCountInput] = useState<string>(() => String(config.sickCount))
  const [urgentCountInput, setUrgentCountInput] = useState<string>(() => String(config.urgentCount))
  const [pcaUrgentInvalidProbInput, setPcaUrgentInvalidProbInput] = useState<string>(() => String(config.pcaUrgentInvalidSlotProbability))
  // Randomizer range inputs
  const [plannedTherapistMinInput, setPlannedTherapistMinInput] = useState<string>(() => String(config.plannedTherapistMin))
  const [sickCountMinInput, setSickCountMinInput] = useState<string>(() => String(config.sickCountMin))
  const [sickCountMaxInput, setSickCountMaxInput] = useState<string>(() => String(config.sickCountMax))
  const [urgentCountMinInput, setUrgentCountMinInput] = useState<string>(() => String(config.urgentCountMin))
  const [urgentCountMaxInput, setUrgentCountMaxInput] = useState<string>(() => String(config.urgentCountMax))
  const [pcaBudgetMinInput, setPcaBudgetMinInput] = useState<string>(() => String(config.plannedPcaFteBudgetMin))
  const [pcaBudgetMaxInput, setPcaBudgetMaxInput] = useState<string>(() => String(config.plannedPcaFteBudgetMax))
  const [randomizerRangesOpen, setRandomizerRangesOpen] = useState(false)
  const [rankWeightInputs, setRankWeightInputs] = useState<Record<'SPT' | 'APPT' | 'RPT' | 'PCA', string>>(() => ({
    SPT: String((config.rankWeights as any)?.SPT ?? 1),
    APPT: String((config.rankWeights as any)?.APPT ?? 1),
    RPT: String((config.rankWeights as any)?.RPT ?? 1),
    PCA: String((config.rankWeights as any)?.PCA ?? 1),
  }))
  const [plannedLeaveTypeWeightInputs, setPlannedLeaveTypeWeightInputs] = useState<string[]>(
    () => (config.plannedLeaveTypeWeights || []).map((x) => String(x.weight))
  )
  // Per-patch FTE remaining inputs — allows free typing before blur commits the value.
  const [fteInputs, setFteInputs] = useState<Record<string, string>>({})
  const [urgentLeaveTypeWeightInputs, setUrgentLeaveTypeWeightInputs] = useState<string[]>(
    () => (config.urgentLeaveTypeWeights || []).map((x) => String(x.weight))
  )

  const staffById = useMemo(() => new Map(props.staff.map((s) => [s.id, s] as const)), [props.staff])

  const syncInputsFromConfig = (next: DevLeaveSimConfig) => {
    setPlannedTherapistCountInput(String(next.plannedTherapistCount))
    setPlannedPcaBudgetInput(String(next.plannedPcaFteBudget))
    setSickCountInput(String(next.sickCount))
    setUrgentCountInput(String(next.urgentCount))
    setPcaUrgentInvalidProbInput(String(next.pcaUrgentInvalidSlotProbability))
    setPlannedTherapistMinInput(String(next.plannedTherapistMin))
    setSickCountMinInput(String(next.sickCountMin))
    setSickCountMaxInput(String(next.sickCountMax))
    setUrgentCountMinInput(String(next.urgentCountMin))
    setUrgentCountMaxInput(String(next.urgentCountMax))
    setPcaBudgetMinInput(String(next.plannedPcaFteBudgetMin))
    setPcaBudgetMaxInput(String(next.plannedPcaFteBudgetMax))
    setRankWeightInputs({
      SPT: String((next.rankWeights as any)?.SPT ?? 1),
      APPT: String((next.rankWeights as any)?.APPT ?? 1),
      RPT: String((next.rankWeights as any)?.RPT ?? 1),
      PCA: String((next.rankWeights as any)?.PCA ?? 1),
    })
    setPlannedLeaveTypeWeightInputs((next.plannedLeaveTypeWeights || []).map((x) => String(x.weight)))
    setUrgentLeaveTypeWeightInputs((next.urgentLeaveTypeWeights || []).map((x) => String(x.weight)))
  }

  // Load persisted config/draft when opened.
  useEffect(() => {
    if (!props.open) return
    try {
      const key = getLocalKey(props.selectedDateKey)
      const raw = window.localStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw) as any
      if (parsed?.config) {
        const merged = { ...defaultDevLeaveSimConfig(), ...(parsed.config as any) } as DevLeaveSimConfig
        setConfig(merged)
        syncInputsFromConfig(merged)
      }
      if (parsed?.draft) setDraft(parsed.draft)
      if (parsed?.appliedOriginalsByStaffId) setAppliedOriginalsByStaffId(parsed.appliedOriginalsByStaffId)
      if (parsed?.activeTab === 'edit' || parsed?.activeTab === 'run' || parsed?.activeTab === 'bundle') setActiveTab(parsed.activeTab)
      const asMode = (v: unknown): LeaveSimStepMode | null =>
        v === 'automatic' || v === 'interactive' ? v : null
      if (asMode(parsed?.step2Mode20)) setStep2Mode20(asMode(parsed.step2Mode20)!)
      if (asMode(parsed?.step2Mode21)) setStep2Mode21(asMode(parsed.step2Mode21)!)
      if (asMode(parsed?.step2Mode22)) setStep2Mode22(asMode(parsed.step2Mode22)!)
      if (asMode(parsed?.step2Mode23)) setStep2Mode23(asMode(parsed.step2Mode23)!)
      if (parsed?.step3Engine === 'v1' || parsed?.step3Engine === 'v2') setStep3Engine(parsed.step3Engine)
      if (parsed?.step3V1WizardAllocationMode === 'standard' || parsed?.step3V1WizardAllocationMode === 'balanced') {
        setStep3V1WizardAllocationMode(parsed.step3V1WizardAllocationMode)
      }
      if (asMode(parsed?.step3Mode30)) setStep3Mode30(asMode(parsed.step3Mode30)!)
      if (asMode(parsed?.step3Mode32)) setStep3Mode32(asMode(parsed.step3Mode32)!)
      if (asMode(parsed?.step3Mode33)) setStep3Mode33(asMode(parsed.step3Mode33)!)
      // Legacy booleans (pre–Apr 2026 harness layout)
      if (!asMode(parsed?.step2Mode20) && typeof parsed?.step2Auto21 === 'boolean') {
        setStep2Mode20(parsed.step2Auto21 ? 'automatic' : 'interactive')
      }
      if (!asMode(parsed?.step2Mode21) && typeof parsed?.step2Auto20 === 'boolean') {
        setStep2Mode21(parsed.step2Auto20 ? 'automatic' : 'interactive')
      }
      if (!asMode(parsed?.step2Mode22) && typeof parsed?.step2Auto22 === 'boolean') {
        setStep2Mode22(parsed.step2Auto22 ? 'automatic' : 'interactive')
      }
      if (!asMode(parsed?.step3Mode32) && typeof parsed?.step3Auto32 === 'boolean') {
        setStep3Mode32(parsed.step3Auto32 ? 'automatic' : 'interactive')
      }
      if (!asMode(parsed?.step3Mode33) && typeof parsed?.step3Auto33 === 'boolean') {
        setStep3Mode33(parsed.step3Auto33 ? 'automatic' : 'interactive')
      }
      if (typeof parsed?.step30BufferPreAssignRatio === 'number') {
        const n = Math.max(0, Math.min(1, parsed.step30BufferPreAssignRatio))
        setStep30BufferPreAssignRatio(n)
      }
      if (parsed?.report) setReport(parsed.report)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.selectedDateKey])

  // Persist on change (best effort).
  useEffect(() => {
    if (!props.open) return
    try {
      const key = getLocalKey(props.selectedDateKey)
      window.localStorage.setItem(
        key,
        JSON.stringify({
          config,
          draft,
          appliedOriginalsByStaffId,
          activeTab,
          report,
          step2Mode20,
          step2Mode21,
          step2Mode22,
          step2Mode23,
          step3Engine,
          step3V1WizardAllocationMode,
          step3Mode30,
          step3Mode32,
          step3Mode33,
          step30BufferPreAssignRatio,
        })
      )
    } catch {
      // ignore
    }
  }, [
    props.open,
    props.selectedDateKey,
    config,
    draft,
    appliedOriginalsByStaffId,
    activeTab,
    report,
    step2Mode20,
    step2Mode21,
    step2Mode22,
    step2Mode23,
    step3Engine,
    step3V1WizardAllocationMode,
    step3Mode30,
    step3Mode32,
    step3Mode33,
    step30BufferPreAssignRatio,
  ])

  const touchedStaffIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of draft?.patches ?? []) set.add(p.staffId)
    return set
  }, [draft])

  /**
   * Parent schedule state updates often during Steps 2–4 (pending FTE, visible teams, etc.).
   * Those values must NOT be in the pipeline `useEffect` deps: re-running the effect cancels the
   * in-flight async runner, restarts steps, and can cascade into Radix Select ref/update loops.
   * Read the latest values from this ref inside the pipeline instead.
   */
  const harnessPipelineInputRef = useRef({
    visibleTeams: props.visibleTeams,
    pendingPCAFTEPerTeam: props.pendingPCAFTEPerTeam,
    touchedStaffIds,
  })
  harnessPipelineInputRef.current.visibleTeams = props.visibleTeams
  harnessPipelineInputRef.current.pendingPCAFTEPerTeam = props.pendingPCAFTEPerTeam
  harnessPipelineInputRef.current.touchedStaffIds = touchedStaffIds

  const generate = () => {
    const normalizedTherapistCount = Math.floor(
      clampNumber(safeNumberInput(plannedTherapistCountInput, config.plannedTherapistCount), 0, config.plannedTherapistMax)
    )
    const normalizedPcaBudget = clampNumber(
      safeNumberInput(plannedPcaBudgetInput, config.plannedPcaFteBudget),
      0,
      config.plannedPcaFteBudgetMax
    )
    const normalizedSickCount = Math.floor(clampNumber(safeNumberInput(sickCountInput, config.sickCount), 0, 50))
    const normalizedUrgentCount = Math.floor(clampNumber(safeNumberInput(urgentCountInput, config.urgentCount), 0, 50))
    const normalizedInvalidProb = clampNumber(
      safeNumberInput(pcaUrgentInvalidProbInput, config.pcaUrgentInvalidSlotProbability),
      0,
      1
    )

    const nextConfig: DevLeaveSimConfig = {
      ...config,
      plannedTherapistCount: normalizedTherapistCount,
      plannedPcaFteBudget: normalizedPcaBudget,
      sickCount: normalizedSickCount,
      urgentCount: normalizedUrgentCount,
      pcaUrgentInvalidSlotProbability: normalizedInvalidProb,
    }
    setConfig(nextConfig)
    syncInputsFromConfig(nextConfig)
    const d = generateDevLeaveSimDraft({
      staff: props.staff,
      specialPrograms: props.specialPrograms,
      sptAllocations: props.sptAllocations,
      weekday: props.weekday,
      config: nextConfig,
    })
    setDraft(d)
    setReport(null)
    // UX: after generating, jump to the draft patches so dev can review immediately
    // (especially on small screens where patches appear below the config controls).
    requestAnimationFrame(() => {
      try {
        draftPatchesTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        // ignore
      }
    })
  }

  const randomizeCountsAndSeed = () => {
    // New master seed + deterministic quota draw (separate PRNG stream from draft generation).
    const nextSeed = String(Date.now())
    const q = sampleLeaveSimQuotas({ config, masterSeed: nextSeed })
    const next: DevLeaveSimConfig = {
      ...config,
      seed: nextSeed,
      plannedTherapistCount: q.plannedTherapistCount,
      plannedPcaFteBudget: q.plannedPcaFteBudget,
      sickCount: q.sickCount,
      urgentCount: q.urgentCount,
    }
    setConfig(next)
    syncInputsFromConfig(next)
  }

  const applyMergedOverrides = (mode: 'clean' | 'merge') => {
    if (!draft) return
    const sptBaseFteMap: Record<string, number> = {}
    const sptConfigMap = getSptWeekdayConfigMap({ weekday: props.weekday, sptAllocations: props.sptAllocations })
    Object.entries(sptConfigMap).forEach(([staffId, cfg]) => {
      if (cfg.baseFte > 0) sptBaseFteMap[staffId] = cfg.baseFte
    })
    const patchOverrides = buildOverridesFromDraft(draft, sptBaseFteMap)

    // Capture originals so we can reset generated-only.
    const originals: Record<string, any> = {}
    Object.keys(patchOverrides).forEach((staffId) => {
      originals[staffId] = props.staffOverrides?.[staffId] ?? null
    })
    setAppliedOriginalsByStaffId(originals)

    const base: StaffOverrideLike = mode === 'merge' ? { ...(props.staffOverrides as any) } : {}
    const next: StaffOverrideLike = { ...base, ...patchOverrides }

    // Ensure we do not accidentally treat schedule-level metadata as staff IDs.
    Object.keys(next).forEach((k) => {
      if (k.startsWith('__')) return
      const o = (next as any)[k]
      if (!o || typeof o !== 'object') return
    })

    if (mode === 'clean') {
      props.clearDomainFromStep('leave-fte')
      // Applying harness patches should immediately unlock Step 2 via step-flow gating.
      props.setHasSavedAllocations(false)
      props.setStep2Result(null)
      props.setInitializedSteps(new Set())
      props.setStepStatus({
        'leave-fte': 'modified',
        'therapist-pca': 'pending',
        'floating-pca': 'pending',
        'bed-relieving': 'pending',
        review: 'pending',
      })
      props.goToStep('leave-fte')
    } else {
      // Merge mode still invalidates downstream steps.
      props.setHasSavedAllocations(false)
      props.setStep2Result(null)
      props.setInitializedSteps(new Set())
      props.setStepStatus({
        'leave-fte': 'modified',
        'therapist-pca': 'pending',
        'floating-pca': 'pending',
        'bed-relieving': 'pending',
        review: 'pending',
      })
      props.goToStep('leave-fte')
    }

    props.setStaffOverrides(next)
    props.recalculateScheduleCalculations()
    setReport(null)
    setActiveTab('run')
  }

  const resetGeneratedOnly = () => {
    const originals = appliedOriginalsByStaffId
    if (!originals) return
    const next: StaffOverrideLike = { ...(props.staffOverrides as any) }
    Object.entries(originals).forEach(([staffId, original]) => {
      if (original == null) {
        delete (next as any)[staffId]
      } else {
        ;(next as any)[staffId] = original
      }
    })
    props.setHasSavedAllocations(false)
    props.setStep2Result(null)
    props.setInitializedSteps(new Set())
    props.setStepStatus({
      'leave-fte': 'modified',
      'therapist-pca': 'pending',
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      review: 'pending',
    })
    props.goToStep('leave-fte')
    props.setStaffOverrides(next)
    props.recalculateScheduleCalculations()
    setReport(null)
  }

  const resetAll = () => {
    setAppliedOriginalsByStaffId(null)
    setDraft(null)
    setReport(null)
    props.clearDomainFromStep('leave-fte')
  }

  // Pipeline runner is staged across renders so downstream steps see fresh state.
  // This avoids the "Step 3 can't run right after Step 2" stale-closure problem.
  useEffect(() => {
    if (!pipelinePhase) return
    if (props.userRole !== 'developer') return
    let cancelled = false

    const run = async () => {
      try {
        if (pipelinePhase === 'step2') {
          props.clearDomainFromStep('therapist-pca')
          props.goToStep('therapist-pca')
          props.recalculateScheduleCalculations()
          if (props.runStep2Auto) {
            await props.runStep2Auto({
              autoStep20: step2Mode21 === 'automatic',
              autoStep21: step2Mode20 === 'automatic',
              autoStep22: step2Mode22 === 'automatic',
              autoStep23: step2Mode23 === 'automatic',
            })
          } else {
            await props.runStep2({ cleanedOverrides: undefined })
          }
          if (!cancelled) setPipelinePhase('step3')
          return
        }

        if (pipelinePhase === 'step3') {
          if (clearTieBreakDecisions) props.setTieBreakDecisions({})
          props.clearDomainFromStep('floating-pca')
          props.goToStep('floating-pca')
          if (step3Engine === 'v2') {
            if (props.runStep3V2Auto) {
              const bufferRatio = step3Mode30 === 'automatic' ? step30BufferPreAssignRatio : 0
              await props.runStep3V2Auto({
                autoStep32: step3Mode32 === 'automatic',
                autoStep33: step3Mode33 === 'automatic',
                bufferPreAssignRatio: bufferRatio,
              })
            } else {
              await props.runStep3({
                onTieBreak: async ({ teams }) => [...teams].sort()[0]!,
              })
            }
          } else {
            const { teamOrder, pendingForV1 } = buildStep3HarnessTeamOrder({
              visibleTeams: harnessPipelineInputRef.current.visibleTeams ?? TEAMS,
              pendingPerTeam: harnessPipelineInputRef.current.pendingPCAFTEPerTeam,
            })
            await props.runStep3({
              onTieBreak: async ({ teams }) => [...teams].sort()[0]!,
              userTeamOrder: teamOrder,
              userAdjustedPendingFTE: pendingForV1,
            })
          }
          if (!cancelled) setPipelinePhase('step4')
          return
        }

        if (pipelinePhase === 'step4') {
          props.clearDomainFromStep('bed-relieving')
          props.goToStep('bed-relieving')
          await props.runStep4()
          if (!cancelled) setPipelinePhase('invariants')
          return
        }

        if (pipelinePhase === 'invariants') {
          const rep = runDevLeaveSimInvariants({
            staff: props.staff,
            staffOverrides: props.staffOverrides,
            therapistAllocationsByTeam: props.therapistAllocationsByTeam,
            pcaAllocationsByTeam: props.pcaAllocationsByTeam,
            calculationsByTeam: props.calculationsByTeam,
            touchedStaffIds: harnessPipelineInputRef.current.touchedStaffIds,
          })
          setReport(rep)
          setIsRunningSteps(false)
          setPipelinePhase(null)
          props.onOpenChange(false)
        }
      } catch (e) {
        console.error('DevLeaveSim pipeline failed:', e)
        setIsRunningSteps(false)
        setPipelinePhase(null)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pipelinePhase,
    props.userRole,
    clearTieBreakDecisions,
    step2Mode20,
    step2Mode21,
    step2Mode22,
    step2Mode23,
    step3Engine,
    step3Mode30,
    step3Mode32,
    step3Mode33,
    step30BufferPreAssignRatio,
  ])

  const runAllSteps = () => {
    if (props.userRole !== 'developer') return
    if (isRunningSteps) return
    setIsRunningSteps(true)
    setPipelinePhase('step2')
  }

  const exportBundle = async (download: boolean) => {
    if (!draft) return
    const bundle: DevLeaveSimDebugBundle = {
      schemaVersion: 1,
      dateKey: props.selectedDateKey,
      exportedAt: new Date().toISOString(),
      draft,
      appliedOriginalsByStaffId: appliedOriginalsByStaffId ?? undefined,
    }
    const text = serializeDevLeaveSimBundle(bundle)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore clipboard errors
    }
    if (download) {
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rbip-dev-leave-sim-${props.selectedDateKey}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const importBundle = () => {
    const res = parseDevLeaveSimBundle(importText)
    if (!res.ok) {
      setReport({
        ok: false,
        issues: [res.error],
        summary: { touchedStaffCount: 0, pcaOverAllocatedCount: 0, pcaSlotConflictsCount: 0 },
      })
      return
    }
    setDraft(res.bundle.draft)
    const merged = { ...defaultDevLeaveSimConfig(), ...(res.bundle.draft.config as any) } as DevLeaveSimConfig
    setConfig(merged)
    syncInputsFromConfig(merged)
    setAppliedOriginalsByStaffId(res.bundle.appliedOriginalsByStaffId ?? null)
    setReport(null)
  }

  const updatePatch = (staffId: string, updater: (p: DevLeaveSimStaffPatch) => DevLeaveSimStaffPatch) => {
    setDraft((prev) => {
      if (!prev) return prev
      const patches = prev.patches.map((p) => (p.staffId === staffId ? updater(p) : p))
      return { ...prev, patches }
    })
  }

  const renderPatchRow = (p: DevLeaveSimStaffPatch) => {
    const staff = staffById.get(p.staffId)
    const name = staff?.name ?? p.staffId
    const isPca = p.rank === 'PCA'
    const inv = p.invalidSlots?.[0]
    const invSlot = inv?.slot ?? null
    const pcaDerivedFteRemaining = isPca ? pcaSlotFteFromAvailableSlots(p.availableSlots) : null
    return (
      <div key={`patch-${p.staffId}`} className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium truncate">
              {name} <span className="text-xs text-muted-foreground">({p.rank}, {p.bucket})</span>
            </div>
            <div className="text-xs text-muted-foreground truncate">{p.staffId}</div>
          </div>
        </div>

        <div className={cn('grid gap-3', isPca ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1 lg:grid-cols-3')}>
          <div className="space-y-1">
            <Label className="text-xs">Leave type</Label>
            <Select
              value={p.leaveType === null ? 'none' : String(p.leaveType)}
              onValueChange={(v) => {
                const next = v === 'none' ? null : (v as LeaveType)
                updatePatch(p.staffId, (prev) => ({ ...prev, leaveType: next }))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={`lt-${String(opt)}`} value={opt === null ? 'none' : String(opt)}>
                    {opt === null ? 'On duty (no leave)' : String(opt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Tooltip
              side="bottom"
              content={
                isPca
                  ? 'Derived from available slots (0.25 FTE per slot). Tick/untick slots to change.'
                  : 'FTE remaining can be non-multiple of 0.25. For PCA slot capacity, Step 2+ still uses availableSlots.'
              }
            >
              <Label className="text-xs cursor-default">FTE remaining</Label>
            </Tooltip>
            {isPca ? (
              <Input value={String(pcaDerivedFteRemaining ?? 0)} disabled />
            ) : (
              <Input
                value={fteInputs[p.staffId] ?? String(p.fteRemaining)}
                onChange={(e) => {
                  setFteInputs((prev) => ({ ...prev, [p.staffId]: e.target.value }))
                }}
                onBlur={(e) => {
                  const n = round2(clampNumber(safeNumberInput(e.target.value, p.fteRemaining), 0, 1))
                  setFteInputs((prev) => ({ ...prev, [p.staffId]: String(n) }))
                  updatePatch(p.staffId, (prev) => ({
                    ...prev,
                    fteRemaining: n,
                    fteSubtraction: round2(1 - n),
                  }))
                }}
              />
            )}
          </div>

          {isPca ? (
            <div className="space-y-1">
              <Tooltip side="bottom" content="These slots define the PCA's true assignable capacity in Step 2+ (0.25 FTE each).">
                <Label className="text-xs cursor-default">Available slots</Label>
              </Tooltip>
              <div className="flex items-center gap-2 flex-wrap">
                {ALL_SLOTS.map((slot) => {
                  const checked = (p.availableSlots ?? []).includes(slot)
                  const disabled = invSlot === slot
                  return (
                    <label key={`slot-${p.staffId}-${slot}`} className={cn('inline-flex items-center gap-1 text-xs', disabled && 'opacity-50')}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          updatePatch(p.staffId, (prev) => {
                            const cur = Array.isArray(prev.availableSlots) ? prev.availableSlots : []
                            const next = v ? [...cur, slot] : cur.filter((s) => s !== slot)
                            const uniq = Array.from(new Set(next)).sort((a, b) => a - b)
                            const derived = pcaSlotFteFromAvailableSlots(uniq)
                            return { ...prev, availableSlots: uniq, fteRemaining: derived, fteSubtraction: round2(1 - derived) }
                          })
                        }}
                        disabled={disabled}
                      />
                      Slot {slot}
                    </label>
                  )
                })}
              </div>
              {invSlot != null ? (
                <div className="text-[11px] text-muted-foreground">Invalid slot is excluded from available slots.</div>
              ) : null}
            </div>
          ) : null}

          {isPca ? (
            <div className="space-y-1">
              <Tooltip
                side="bottom"
                content="Medical follow-up often creates an invalid slot (partially present in the slot). That slot is not counted as a valid assigned slot."
              >
                <Label className="text-xs cursor-default">Invalid slot (optional)</Label>
              </Tooltip>
              <Select
                value={invSlot == null ? 'none' : String(invSlot)}
                onValueChange={(v) => {
                  if (v === 'none') {
                    updatePatch(p.staffId, (prev) => {
                      const derived = pcaSlotFteFromAvailableSlots(prev.availableSlots)
                      return { ...prev, invalidSlots: [], fteRemaining: derived, fteSubtraction: round2(1 - derived) }
                    })
                    return
                  }
                  const slot = parseInt(v, 10)
                  if (!isValidSlot(slot)) return
                  updatePatch(p.staffId, (prev) => ({
                    ...prev,
                    invalidSlots: [{ slot, timeRange: prev.invalidSlots?.[0]?.timeRange ?? { start: '0900', end: '1030' } }],
                    availableSlots: Array.isArray(prev.availableSlots) ? prev.availableSlots.filter((s) => s !== slot) : prev.availableSlots,
                    fteRemaining: pcaSlotFteFromAvailableSlots(
                      Array.isArray(prev.availableSlots) ? prev.availableSlots.filter((s) => s !== slot) : prev.availableSlots
                    ),
                    fteSubtraction: round2(
                      1 -
                        pcaSlotFteFromAvailableSlots(
                          Array.isArray(prev.availableSlots) ? prev.availableSlots.filter((s) => s !== slot) : prev.availableSlots
                        )
                    ),
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="1">Slot 1</SelectItem>
                  <SelectItem value="2">Slot 2</SelectItem>
                  <SelectItem value="3">Slot 3</SelectItem>
                  <SelectItem value="4">Slot 4</SelectItem>
                </SelectContent>
              </Select>
              {invSlot != null ? (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Present interval</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      className="w-20"
                      value={inv?.timeRange.start ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        updatePatch(p.staffId, (prev) => {
                          const cur = prev.invalidSlots?.[0]
                          if (!cur) return prev
                          return { ...prev, invalidSlots: [{ ...cur, timeRange: { ...cur.timeRange, start: val } }] }
                        })
                      }}
                      placeholder="HHMM"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">–</span>
                    <Input
                      className="w-20"
                      value={inv?.timeRange.end ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        updatePatch(p.staffId, (prev) => {
                          const cur = prev.invalidSlots?.[0]
                          if (!cur) return prev
                          return { ...prev, invalidSlots: [{ ...cur, timeRange: { ...cur.timeRange, end: val } }] }
                        })
                      }}
                      placeholder="HHMM"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Developer Leave Simulation (seeded)</DialogTitle>
              <div className="text-xs text-muted-foreground">
                Date: {formatDateForInput(props.selectedDate)} ({props.weekday}) · Seed: {config.seed}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => props.onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="mt-4">
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-sm transition-colors',
                activeTab === 'edit' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Leave edit + draft
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('run')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-sm transition-colors',
                activeTab === 'run' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Run steps
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bundle')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-sm transition-colors',
                activeTab === 'bundle' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Debug bundle
            </button>
          </div>
        </div>

        {activeTab === 'bundle' ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Export</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={!draft} onClick={() => exportBundle(false)}>
                    Copy
                  </Button>
                  <Button variant="outline" disabled={!draft} onClick={() => exportBundle(true)}>
                    Download
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Exports seed + config + draft patches (and applied originals if available) for fast replay.
              </div>
            </div>

            <div className="rounded-md border border-border p-4 space-y-2">
              <Label className="text-sm font-medium">Import</Label>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste debug bundle JSON here to import"
                className="min-h-[240px]"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={importBundle}>
                  Import bundle
                </Button>
                <Button variant="outline" onClick={() => setImportText('')}>
                  Clear
                </Button>
              </div>
            </div>

          </div>
        ) : activeTab === 'run' ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-border bg-card/30 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Step 2 · Therapist and non-floating PCA</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Automatic</span> resolves without that mini-step dialog when
                  possible. <span className="font-medium text-foreground">Interactive</span> opens the real dialog.
                </p>
              </div>
              <div className="space-y-2">
                <MiniStepRow
                  title="Step 2.0 · Special programs"
                  helper="Automatic: keep current program overrides when nothing forces the override dialog. Interactive: review programs when any are active on this weekday."
                  value={step2Mode20}
                  onChange={setStep2Mode20}
                />
                <MiniStepRow
                  title="Step 2.1 · Non-floating substitutions"
                  helper="Automatic: pick substitute floaters with a deterministic heuristic. Interactive: use the substitution wizard."
                  value={step2Mode21}
                  onChange={setStep2Mode21}
                />
                <MiniStepRow
                  title="Step 2.2 · SPT final edit"
                  helper="Automatic: keep therapist/SPT outputs after Step 2.1 (no extra SPT dialog)."
                  value={step2Mode22}
                  onChange={setStep2Mode22}
                />
                {props.showSharedTherapistStep ? (
                  <MiniStepRow
                    title="Step 2.3 · Shared therapist"
                    helper="Automatic: skip shared-therapist edits. Interactive: open the Shared Therapist dialog when applicable."
                    value={step2Mode23}
                    onChange={setStep2Mode23}
                  />
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-border bg-card/30 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Step 3 · Floating PCA harness</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Pick the headless engine for runs from this dialog. Use the on-schedule wizard when you need full 3.0–3.4
                  interaction.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-border/70 bg-muted/15 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">Engine</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                    V2 (default, matches Floating PCA v2) or legacy V1 headless allocator.
                  </p>
                </div>
                <div className="inline-flex shrink-0 rounded-md border border-border bg-background p-0.5">
                  <button
                    type="button"
                    className={cn(
                      'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                      step3Engine === 'v2' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setStep3Engine('v2')}
                  >
                    V2
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                      step3Engine === 'v1' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setStep3Engine('v1')}
                  >
                    V1
                  </button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border border-dashed border-border/80 px-3 py-2">
                <div className="min-w-0">
                  <Tooltip
                    side="bottom"
                    content="Clears saved tie-break picks before Step 3 so older tests cannot steer outcomes."
                  >
                    <div className="inline-flex">
                      <span className="text-xs font-medium cursor-default">Clear tie-break memory before Step 3</span>
                    </div>
                  </Tooltip>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                    Applies to pipeline + Step 3 buttons (not Step 2).
                  </p>
                </div>
                <Switch checked={clearTieBreakDecisions} onCheckedChange={setClearTieBreakDecisions} />
              </div>

              {step3Engine === 'v1' ? (
                <div className="space-y-2 rounded-md border border-border/70 bg-muted/10 px-3 py-2">
                  <Label className="text-xs font-medium">V1 wizard · allocation style (on-schedule UI)</Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Standard keeps 3.2/3.3 preference passes; Balanced jumps straight to the main allocator. Applies when you
                    open the Step 3 V1 wizard on the schedule. The harness headless V1 run still uses the legacy allocator
                    entry point with recomputed team order.
                  </p>
                  <Select
                    value={step3V1WizardAllocationMode}
                    onValueChange={(v) => setStep3V1WizardAllocationMode(v as 'standard' | 'balanced')}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard (3.2 / 3.3 then allocate)</SelectItem>
                      <SelectItem value="balanced">Balanced (skip 3.2 / 3.3 in wizard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {step3Engine === 'v2' ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-foreground">Headless V2 mini-steps</div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Step 3.1 always uses latest pending FTE and recomputes team order (highest pending first) before the v2
                    allocator. Choose Interactive when you want to finish that part in the schedule wizard instead.
                  </p>
                  <MiniStepRow
                    title="Step 3.0 · Buffer floaters"
                    helper="Automatic applies the buffer pre-assign ratio below. Interactive defers buffer confirmation to the Step 3 wizard."
                    value={step3Mode30}
                    onChange={setStep3Mode30}
                  />
                  {step3Mode30 === 'automatic' ? (
                    <div className="ml-1 space-y-1 border-l-2 border-primary/30 pl-3">
                      <Label className="text-[11px] text-muted-foreground">Buffer pre-assign ratio</Label>
                      <Select
                        value={String(step30BufferPreAssignRatio)}
                        onValueChange={(v) => {
                          const n = Math.max(0, Math.min(1, parseFloat(String(v))))
                          setStep30BufferPreAssignRatio(Number.isFinite(n) ? n : 0)
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0% (none)</SelectItem>
                          <SelectItem value="0.25">25%</SelectItem>
                          <SelectItem value="0.5">50%</SelectItem>
                          <SelectItem value="0.75">75%</SelectItem>
                          <SelectItem value="1">100%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <MiniStepRow
                    title="Step 3.2 · Preferred reservations"
                    helper="Automatic applies greedy preferred-slot reservations before the v2 allocator."
                    value={step3Mode32}
                    onChange={setStep3Mode32}
                  />
                  <MiniStepRow
                    title="Step 3.3 · Adjacent reservations"
                    helper="Automatic assigns adjacent slots tied to special-program PCAs before the allocator."
                    value={step3Mode33}
                    onChange={setStep3Mode33}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground leading-snug">
                  Headless <span className="font-medium text-foreground">V1</span> uses latest pending FTE with a recomputed
                  team order (highest pending first, stable tie-break) before running the legacy floating PCA allocator.
                </div>
              )}

              {props.openStep3Wizard ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground min-w-0 leading-snug">
                    Need the full wizard (3.0–3.4)? Jump to Step 3 on the schedule. This closes Leave Sim.
                  </p>
                  <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => props.openStep3Wizard?.()}>
                    Open Step 3 wizard
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="default" onClick={runAllSteps} disabled={isRunningSteps}>
                  Run pipeline (Steps 2–4) + invariants
                </Button>
                <Button
                  variant="outline"
                  disabled={isRunningSteps}
                  onClick={async () => {
                    if (props.userRole !== 'developer') return
                    setIsRunningSteps(true)
                    try {
                      props.clearDomainFromStep('therapist-pca')
                      props.goToStep('therapist-pca')
                      props.recalculateScheduleCalculations()
                      if (props.runStep2Auto) {
                        await props.runStep2Auto({
                          autoStep20: step2Mode21 === 'automatic',
                          autoStep21: step2Mode20 === 'automatic',
                          autoStep22: step2Mode22 === 'automatic',
                          autoStep23: step2Mode23 === 'automatic',
                        })
                      } else {
                        await props.runStep2({})
                      }
                    } finally {
                      setIsRunningSteps(false)
                      props.onOpenChange(false)
                    }
                  }}
                >
                  Run Step 2 only
                </Button>
                <Button
                  variant="outline"
                  disabled={isRunningSteps}
                  onClick={async () => {
                    if (props.userRole !== 'developer') return
                    setIsRunningSteps(true)
                    try {
                      if (clearTieBreakDecisions) props.setTieBreakDecisions({})
                      props.clearDomainFromStep('floating-pca')
                      props.goToStep('floating-pca')
                      if (step3Engine === 'v2') {
                        if (props.runStep3V2Auto) {
                          const bufferRatio = step3Mode30 === 'automatic' ? step30BufferPreAssignRatio : 0
                          await props.runStep3V2Auto({
                            autoStep32: step3Mode32 === 'automatic',
                            autoStep33: step3Mode33 === 'automatic',
                            bufferPreAssignRatio: bufferRatio,
                          })
                        } else {
                          await props.runStep3({ onTieBreak: async ({ teams }) => [...teams].sort()[0]! })
                        }
                      } else {
                        const { teamOrder, pendingForV1 } = buildStep3HarnessTeamOrder({
                          visibleTeams: props.visibleTeams ?? TEAMS,
                          pendingPerTeam: props.pendingPCAFTEPerTeam,
                        })
                        await props.runStep3({
                          onTieBreak: async ({ teams }) => [...teams].sort()[0]!,
                          userTeamOrder: teamOrder,
                          userAdjustedPendingFTE: pendingForV1,
                        })
                      }
                    } finally {
                      setIsRunningSteps(false)
                      props.onOpenChange(false)
                    }
                  }}
                >
                  Run Step 3 only{step3Engine === 'v2' ? ' (V2)' : ' (V1)'}
                </Button>
                <Button
                  variant="outline"
                  disabled={isRunningSteps}
                  onClick={async () => {
                    if (props.userRole !== 'developer') return
                    setIsRunningSteps(true)
                    try {
                      props.clearDomainFromStep('bed-relieving')
                      props.goToStep('bed-relieving')
                      await props.runStep4()
                    } finally {
                      setIsRunningSteps(false)
                      props.onOpenChange(false)
                    }
                  }}
                >
                  Run Step 4 only
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Run buttons close this dialog so you can review the grid immediately.
              </p>
            </div>

            {report ? (
              <div
                className={cn(
                  'rounded-md border p-3 text-xs',
                  report.ok ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/30' : 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30'
                )}
              >
                <div className="font-medium">{report.ok ? 'Invariants: PASS' : 'Invariants: FAIL'}</div>
                {!report.ok ? (
                  <div className="mt-1 space-y-1">
                    {report.issues.slice(0, 12).map((x, idx) => (
                      <div key={`inv-${idx}`}>{x}</div>
                    ))}
                    {report.issues.length > 12 ? <div>…and {report.issues.length - 12} more</div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3 order-2 lg:order-1">
            <div className="flex items-center gap-2">
              <Tooltip side="bottom" content="Deterministic seed. Same seed + same roster/config should reproduce the same draft.">
                <Label className="text-xs cursor-default w-14">Seed</Label>
              </Tooltip>
              <Input value={config.seed} onChange={(e) => setConfig((c) => ({ ...c, seed: e.target.value }))} />
              <Tooltip
                side="bottom"
                content="Sets a new seed and rolls quotas with a seeded RNG (separate stream from Generate). Sick leans low; urgent scales down when sick is high."
              >
                <Button variant="outline" onClick={randomizeCountsAndSeed}>
                  Random
                </Button>
              </Tooltip>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Tooltip side="bottom" content="Planned leave: number of APPT/RPT staff to set as full-day leave (max quota applies).">
                  <Label className="text-xs cursor-default">Planned therapist count</Label>
                </Tooltip>
                <Input
                  value={plannedTherapistCountInput}
                  onChange={(e) => setPlannedTherapistCountInput(e.target.value)}
                  onBlur={() => {
                    const n = Math.floor(clampNumber(safeNumberInput(plannedTherapistCountInput, config.plannedTherapistCount), 0, config.plannedTherapistMax))
                    const next = { ...config, plannedTherapistCount: n }
                    setConfig(next)
                    syncInputsFromConfig(next)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Tooltip side="bottom" content="Planned PCA leave budget in FTE (0–2.0). Generated as 1.0 and 0.5 chunks.">
                  <Label className="text-xs cursor-default">Planned PCA budget</Label>
                </Tooltip>
                <Input
                  value={plannedPcaBudgetInput}
                  onChange={(e) => setPlannedPcaBudgetInput(e.target.value)}
                  onBlur={() => {
                    const n = clampNumber(safeNumberInput(plannedPcaBudgetInput, config.plannedPcaFteBudget), 0, config.plannedPcaFteBudgetMax)
                    const next = { ...config, plannedPcaFteBudget: n }
                    setConfig(next)
                    syncInputsFromConfig(next)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Tooltip side="bottom" content="Sick leave count (mixed ranks). Mutually exclusive with other leave buckets.">
                  <Label className="text-xs cursor-default">Sick leave N</Label>
                </Tooltip>
                <Input
                  value={sickCountInput}
                  onChange={(e) => setSickCountInput(e.target.value)}
                  onBlur={() => {
                    const n = Math.floor(clampNumber(safeNumberInput(sickCountInput, config.sickCount), 0, 50))
                    const next = { ...config, sickCount: n }
                    setConfig(next)
                    syncInputsFromConfig(next)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Tooltip side="bottom" content="Urgent leave count (mixed ranks). Mutually exclusive with other leave buckets.">
                  <Label className="text-xs cursor-default">Urgent leave Y</Label>
                </Tooltip>
                <Input
                  value={urgentCountInput}
                  onChange={(e) => setUrgentCountInput(e.target.value)}
                  onBlur={() => {
                    const n = Math.floor(clampNumber(safeNumberInput(urgentCountInput, config.urgentCount), 0, 50))
                    const next = { ...config, urgentCount: n }
                    setConfig(next)
                    syncInputsFromConfig(next)
                  }}
                />
              </div>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setRandomizerRangesOpen((v) => !v)}
              >
                <Tooltip
                  side="bottom"
                  content="Set the min/max bounds used by the Random button when randomizing counts."
                >
                  <span className="cursor-default">Randomizer ranges</span>
                </Tooltip>
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', randomizerRangesOpen && 'rotate-180')} />
              </button>
              {randomizerRangesOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Therapist min</Label>
                      <Input
                        value={plannedTherapistMinInput}
                        onChange={(e) => setPlannedTherapistMinInput(e.target.value)}
                        onBlur={() => {
                          const n = Math.floor(clampNumber(safeNumberInput(plannedTherapistMinInput, config.plannedTherapistMin), 0, config.plannedTherapistMax))
                          const next = { ...config, plannedTherapistMin: n }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Therapist max</Label>
                      <Input
                        value={String(config.plannedTherapistMax)}
                        onChange={(e) => {
                          const n = Math.floor(clampNumber(safeNumberInput(e.target.value, config.plannedTherapistMax), 0, 50))
                          setConfig((c) => ({ ...c, plannedTherapistMax: n }))
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">PCA budget min</Label>
                      <Input
                        value={pcaBudgetMinInput}
                        onChange={(e) => setPcaBudgetMinInput(e.target.value)}
                        onBlur={() => {
                          const n = clampNumber(safeNumberInput(pcaBudgetMinInput, config.plannedPcaFteBudgetMin), 0, 2)
                          const next = { ...config, plannedPcaFteBudgetMin: n, plannedPcaFteBudgetMax: Math.max(config.plannedPcaFteBudgetMax, n) }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">PCA budget max</Label>
                      <Input
                        value={pcaBudgetMaxInput}
                        onChange={(e) => setPcaBudgetMaxInput(e.target.value)}
                        onBlur={() => {
                          const n = clampNumber(safeNumberInput(pcaBudgetMaxInput, config.plannedPcaFteBudgetMax), 0, 2)
                          const next = { ...config, plannedPcaFteBudgetMax: n, plannedPcaFteBudgetMin: Math.min(config.plannedPcaFteBudgetMin, n) }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Sick min</Label>
                      <Input
                        value={sickCountMinInput}
                        onChange={(e) => setSickCountMinInput(e.target.value)}
                        onBlur={() => {
                          const n = Math.floor(clampNumber(safeNumberInput(sickCountMinInput, config.sickCountMin), 0, 50))
                          const next = { ...config, sickCountMin: n, sickCountMax: Math.max(config.sickCountMax, n) }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Sick max</Label>
                      <Input
                        value={sickCountMaxInput}
                        onChange={(e) => setSickCountMaxInput(e.target.value)}
                        onBlur={() => {
                          const n = Math.floor(clampNumber(safeNumberInput(sickCountMaxInput, config.sickCountMax), 0, 50))
                          const next = { ...config, sickCountMax: n, sickCountMin: Math.min(config.sickCountMin, n) }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Urgent min</Label>
                      <Input
                        value={urgentCountMinInput}
                        onChange={(e) => setUrgentCountMinInput(e.target.value)}
                        onBlur={() => {
                          const n = Math.floor(clampNumber(safeNumberInput(urgentCountMinInput, config.urgentCountMin), 0, 50))
                          const next = { ...config, urgentCountMin: n, urgentCountMax: Math.max(config.urgentCountMax, n) }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Urgent max</Label>
                      <Input
                        value={urgentCountMaxInput}
                        onChange={(e) => setUrgentCountMaxInput(e.target.value)}
                        onBlur={() => {
                          const n = Math.floor(clampNumber(safeNumberInput(urgentCountMaxInput, config.urgentCountMax), 0, 50))
                          const next = { ...config, urgentCountMax: n, urgentCountMin: Math.min(config.urgentCountMin, n) }
                          setConfig(next)
                          syncInputsFromConfig(next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    &quot;Random&quot; uses a seeded draw per new seed: therapist and PCA budget are uniform within ranges (PCA snaps to 0 / 0.5 / 1.0 / 1.5 / 2.0). Sick is weighted toward lower counts; urgent is capped lower when sick is high.
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Tooltip
                side="bottom"
                content={
                  <div className="space-y-1.5">
                    <div className="font-medium">Special-program targeting options:</div>
                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="font-medium">pure_random:</span> Random selection regardless of special program status
                      </div>
                      <div>
                        <span className="font-medium">weighted_random:</span> Random but weighted toward staff with special programs
                      </div>
                      <div>
                        <span className="font-medium">only_special_program:</span> Only select staff who are assigned to special programs
                      </div>
                      <div>
                        <span className="font-medium">exclude_special_program:</span> Only select staff who are NOT in special programs
                      </div>
                    </div>
                  </div>
                }
              >
                <Label className="text-xs cursor-default">Special-program targeting</Label>
              </Tooltip>
              <Select
                value={config.specialProgramTargeting}
                onValueChange={(v) => setConfig((c) => ({ ...c, specialProgramTargeting: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pure_random">pure_random</SelectItem>
                  <SelectItem value="weighted_random">weighted_random</SelectItem>
                  <SelectItem value="only_special_program">only_special_program</SelectItem>
                  <SelectItem value="exclude_special_program">exclude_special_program</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Tooltip
                side="bottom"
                content="Bias PCA leave selection toward non-floating PCAs to better stress-test Step 2 substitution behavior."
              >
                <Label className="text-xs cursor-default">Non-floating PCA targeting</Label>
              </Tooltip>
              <Select
                value={config.pcaNonFloatingTargeting as any}
                onValueChange={(v) => setConfig((c) => ({ ...c, pcaNonFloatingTargeting: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">random</SelectItem>
                  <SelectItem value="prefer_non_floating">prefer_non_floating</SelectItem>
                  <SelectItem value="only_non_floating">only_non_floating</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <Tooltip
                side="bottom"
                content="How sick/urgent leave picks ranks. pool_proportional uses the current roster sizes; custom uses the weights you enter below."
              >
                <Label className="text-xs cursor-default">Rank weighting</Label>
              </Tooltip>
              <Select
                value={config.rankWeightMode}
                onValueChange={(v) => setConfig((c) => ({ ...c, rankWeightMode: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pool_proportional">pool_proportional</SelectItem>
                  <SelectItem value="custom">custom</SelectItem>
                </SelectContent>
              </Select>

              {config.rankWeightMode === 'custom' ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(['SPT', 'APPT', 'RPT', 'PCA'] as const).map((rank) => (
                    <div key={`w-${rank}`} className="space-y-1">
                      <Tooltip side="bottom" content={`Relative weight for picking ${rank} in sick/urgent generation.`}>
                        <Label className="text-[11px] cursor-default">{rank} weight</Label>
                      </Tooltip>
                      <Input
                        value={rankWeightInputs[rank] ?? String((config.rankWeights as any)?.[rank] ?? 1)}
                        onChange={(e) => {
                          const v = e.target.value
                          setRankWeightInputs((prev) => ({ ...prev, [rank]: v }))
                        }}
                        onBlur={(e) => {
                          const n = clampNumber(safeNumberInput(e.target.value, (config.rankWeights as any)?.[rank] ?? 1), 0, 1)
                          setConfig((c) => ({
                            ...c,
                            rankWeights: {
                              ...(c.rankWeights as any),
                              [rank]: n,
                            },
                          }))
                          setRankWeightInputs((prev) => ({ ...prev, [rank]: String(n) }))
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Using pool sizes for weights (no manual inputs).
                </div>
              )}
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <Tooltip side="bottom" content="Adjust which leave types are more likely when generating planned leave.">
                <Label className="text-xs cursor-default">Planned leave type weights</Label>
              </Tooltip>
              <div className="grid grid-cols-2 gap-2">
                {(config.plannedLeaveTypeWeights || []).map((row, idx) => (
                  <div key={`pltw-${idx}`} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">{String(row.leaveType)}</div>
                    <Input
                      value={plannedLeaveTypeWeightInputs[idx] ?? String(row.weight)}
                      onChange={(e) => {
                        const v = e.target.value
                        setPlannedLeaveTypeWeightInputs((prev) => {
                          const next = [...prev]
                          next[idx] = v
                          return next
                        })
                      }}
                      onBlur={(e) => {
                        const n = clampNumber(safeNumberInput(e.target.value, row.weight), 0, 1)
                        setConfig((c) => {
                          const next = [...(c.plannedLeaveTypeWeights || [])]
                          next[idx] = { ...next[idx], weight: n }
                          return { ...c, plannedLeaveTypeWeights: next }
                        })
                        setPlannedLeaveTypeWeightInputs((prev) => {
                          const next = [...prev]
                          next[idx] = String(n)
                          return next
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Higher weight = more likely. Set weight 0 to effectively disable a type.
              </div>
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <Tooltip side="bottom" content="Adjust which leave types are more likely when generating urgent leave (e.g. medical follow-up).">
                <Label className="text-xs cursor-default">Urgent leave type weights</Label>
              </Tooltip>
              <div className="grid grid-cols-2 gap-2">
                {(config.urgentLeaveTypeWeights || []).map((row, idx) => (
                  <div key={`ultw-${idx}`} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">{String(row.leaveType)}</div>
                    <Input
                      value={urgentLeaveTypeWeightInputs[idx] ?? String(row.weight)}
                      onChange={(e) => {
                        const v = e.target.value
                        setUrgentLeaveTypeWeightInputs((prev) => {
                          const next = [...prev]
                          next[idx] = v
                          return next
                        })
                      }}
                      onBlur={(e) => {
                        const n = clampNumber(safeNumberInput(e.target.value, row.weight), 0, 1)
                        setConfig((c) => {
                          const next = [...(c.urgentLeaveTypeWeights || [])]
                          next[idx] = { ...next[idx], weight: n }
                          return { ...c, urgentLeaveTypeWeights: next }
                        })
                        setUrgentLeaveTypeWeightInputs((prev) => {
                          const next = [...prev]
                          next[idx] = String(n)
                          return next
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Tooltip side="bottom" content="Half-day PCA planned leave: whether remaining slots are AM, PM, or random.">
                <Label className="text-xs cursor-default">PCA half-day slots</Label>
              </Tooltip>
              <Select value={config.pcaHalfDaySlotMode} onValueChange={(v) => setConfig((c) => ({ ...c, pcaHalfDaySlotMode: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">random</SelectItem>
                  <SelectItem value="am">am (slots 1-2)</SelectItem>
                  <SelectItem value="pm">pm (slots 3-4)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Tooltip side="bottom" content="When enabled, urgent PCA leave may generate an invalid slot with a presence interval.">
                  <Label className="text-xs cursor-default">PCA urgent invalid slot</Label>
                </Tooltip>
                <Switch checked={config.pcaUrgentUsesInvalidSlot} onCheckedChange={(v) => setConfig((c) => ({ ...c, pcaUrgentUsesInvalidSlot: v }))} />
              </div>
              <div className="space-y-1">
                <Tooltip side="bottom" content="Probability (0–1) that a PCA urgent leave generates an invalid slot.">
                  <Label className="text-xs cursor-default">Probability</Label>
                </Tooltip>
                <Input
                  value={pcaUrgentInvalidProbInput}
                  onChange={(e) => setPcaUrgentInvalidProbInput(e.target.value)}
                  onBlur={() => {
                    const n = clampNumber(safeNumberInput(pcaUrgentInvalidProbInput, config.pcaUrgentInvalidSlotProbability), 0, 1)
                    const next = { ...config, pcaUrgentInvalidSlotProbability: n }
                    setConfig(next)
                    syncInputsFromConfig(next)
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={generate}>Generate draft</Button>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip
                side="bottom"
                content="Revert only the staff overrides touched by the last Apply (uses stored originals captured at apply time)."
              >
                <Button variant="outline" disabled={!appliedOriginalsByStaffId} onClick={resetGeneratedOnly}>
                  Reset generated-only
                </Button>
              </Tooltip>
              <Button variant="destructive" onClick={resetAll}>
                Reset all
              </Button>
            </div>

            {draft?.meta?.excludedSptNotScheduledIds?.length ? (
              <div className="text-xs text-muted-foreground">
                Excluded SPT (not scheduled today): {draft.meta.excludedSptNotScheduledIds.length}
              </div>
            ) : null}
            {draft?.meta?.warnings?.length ? (
              <div className="text-xs text-amber-700">
                Warnings: {draft.meta.warnings.slice(0, 3).join(' · ')}
                {draft.meta.warnings.length > 3 ? ` · …+${draft.meta.warnings.length - 3}` : ''}
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-2 space-y-3 order-1 lg:order-2">
            <div ref={draftPatchesTopRef} />
            <div className="flex items-center justify-between">
              <div className="font-medium">Draft patches</div>
              <div className="text-xs text-muted-foreground">
                {draft ? `${draft.patches.length} staff` : 'No draft generated yet.'}
              </div>
            </div>
            {draft ? (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {draft.patches.map(renderPatchRow)}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Click “Generate draft” to create a seeded scenario.</div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip
                side="bottom"
                content="Apply the generated leave overrides into Step 1 on a clean base (uses the production Clear logic). Does not run Step 2–4."
              >
                <Button variant="outline" disabled={!draft} onClick={() => applyMergedOverrides('clean')}>
                  Apply (clean)
                </Button>
              </Tooltip>
              <Tooltip
                side="bottom"
                content="Apply the generated overrides on top of your current Step 1 edits (still invalidates downstream steps). Does not run Step 2–4."
              >
                <Button variant="outline" disabled={!draft} onClick={() => applyMergedOverrides('merge')}>
                  Apply (merge)
                </Button>
              </Tooltip>
              <div className="text-[11px] text-muted-foreground">
                After applying, you’ll be taken to “Run steps”.
              </div>
            </div>

            <div className="rounded-md border border-border p-3 text-[11px] text-muted-foreground">
              Go to the “Run steps” tab to execute Step 2–4 (the run actions auto-close this dialog for review).
            </div>
          </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}

