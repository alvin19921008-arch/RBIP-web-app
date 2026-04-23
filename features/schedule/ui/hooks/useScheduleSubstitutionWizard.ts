import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { Team } from '@/types/staff'
import { createEmptyTeamRecordFactory } from '@/lib/utils/types'
import type { ScheduleSubstitutionWizardDisplayData } from '@/features/schedule/ui/overlays/SchedulePageDialogNodes'

/** Page-local wizard payload before team-merge display projection (see `substitutionWizardDataForDisplay`). */
export type SubstitutionWizardDataState = {
  teams: Team[]
  substitutionsByTeam: Record<
    Team,
    Array<{
      nonFloatingPCAId: string
      nonFloatingPCAName: string
      team: Team
      fte: number
      missingSlots: number[]
      availableFloatingPCAs: Array<{
        id: string
        name: string
        availableSlots: number[]
        isPreferred: boolean
        isFloorPCA: boolean
        blockedSlotsInfo?: Array<{ slot: number; reasons: string[] }>
      }>
    }>
  >
  isWizardMode: boolean
  initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  allowBackToSpecialPrograms?: boolean
}

export function useScheduleSubstitutionWizard(args: {
  visibleTeams: Team[]
  teamContributorsByMain: Partial<Record<Team, Team[]>>
  mergedInto: Partial<Record<Team, Team>>
}): {
  substitutionWizardOpen: boolean
  setSubstitutionWizardOpen: Dispatch<SetStateAction<boolean>>
  substitutionWizardData: SubstitutionWizardDataState | null
  setSubstitutionWizardData: Dispatch<SetStateAction<SubstitutionWizardDataState | null>>
  substitutionWizardResolverRef: MutableRefObject<
    ((selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => void) | null
  >
  step2WizardAllowBackToSpecialProgramsRef: MutableRefObject<boolean>
  onNonFloatingSubstitutionWizard: (params: {
    teams: Team[]
    substitutionsByTeam: Record<Team, any[]>
    isWizardMode: boolean
    initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  }) => Promise<Record<string, Array<{ floatingPCAId: string; slots: number[] }>>>
  substitutionWizardDataForDisplay: ScheduleSubstitutionWizardDisplayData | null
  handleSubstitutionWizardConfirm: (
    selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  ) => void
  handleSubstitutionWizardCancel: () => void
  handleSubstitutionWizardSkip: () => void
  resetSubstitutionWizardForStepClear: () => void
} {
  const { visibleTeams, teamContributorsByMain, mergedInto } = args

  const [substitutionWizardOpen, setSubstitutionWizardOpen] = useState(false)
  const [substitutionWizardData, setSubstitutionWizardData] = useState<SubstitutionWizardDataState | null>(
    null
  )
  const step2WizardAllowBackToSpecialProgramsRef = useRef(false)
  const substitutionWizardResolverRef = useRef<
    ((selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => void) | null
  >(null)

  const resetSubstitutionWizardForStepClear = useCallback(() => {
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
    substitutionWizardResolverRef.current = null
  }, [])

  const onNonFloatingSubstitutionWizard = useCallback(
    async ({
      teams,
      substitutionsByTeam,
      isWizardMode,
      initialSelections,
    }: {
      teams: Team[]
      substitutionsByTeam: Record<Team, any[]>
      isWizardMode: boolean
      initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
    }): Promise<Record<string, Array<{ floatingPCAId: string; slots: number[] }>>> => {
      if (teams.length === 0) return {}

      return await new Promise((resolve, reject) => {
        setSubstitutionWizardData({
          teams,
          substitutionsByTeam: substitutionsByTeam as SubstitutionWizardDataState['substitutionsByTeam'],
          isWizardMode,
          initialSelections,
          allowBackToSpecialPrograms: step2WizardAllowBackToSpecialProgramsRef.current,
        })
        setSubstitutionWizardOpen(true)

        const resolver = (
          selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>,
          opts?: { cancelled?: boolean; back?: boolean }
        ) => {
          setSubstitutionWizardOpen(false)
          setSubstitutionWizardData(null)
          if (opts?.cancelled) {
            const err: Error & { code?: string } = new Error('user_cancelled')
            err.code = 'user_cancelled'
            reject(err)
            return
          }
          if (opts?.back) {
            const err: Error & { code?: string } = new Error('wizard_back')
            err.code = 'wizard_back'
            reject(err)
            return
          }
          resolve(selections)
        }

        substitutionWizardResolverRef.current = resolver as any
      })
    },
    []
  )

  const handleSubstitutionWizardConfirm = useCallback(
    (selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => {
      if (substitutionWizardResolverRef.current) {
        substitutionWizardResolverRef.current(selections)
        substitutionWizardResolverRef.current = null
      }
    },
    []
  )

  const handleSubstitutionWizardCancel = useCallback(() => {
    if (substitutionWizardResolverRef.current) {
      ;(substitutionWizardResolverRef.current as any)({}, { cancelled: true })
      substitutionWizardResolverRef.current = null
    }
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
  }, [])

  const handleSubstitutionWizardSkip = useCallback(() => {
    if (substitutionWizardResolverRef.current) {
      substitutionWizardResolverRef.current({})
      substitutionWizardResolverRef.current = null
    }
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
  }, [])

  const substitutionWizardDataForDisplay = useMemo(() => {
    if (!substitutionWizardData) return null

    const teams = visibleTeams.filter((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      return contributors.some((team) => (substitutionWizardData.substitutionsByTeam[team] || []).length > 0)
    })

    const substitutionsByTeam = createEmptyTeamRecordFactory<
      Array<{
        nonFloatingPCAId: string
        nonFloatingPCAName: string
        team: Team
        fte: number
        missingSlots: number[]
        availableFloatingPCAs: Array<{
          id: string
          name: string
          availableSlots: number[]
          isPreferred: boolean
          isFloorPCA: boolean
          blockedSlotsInfo?: Array<{ slot: number; reasons: string[] }>
        }>
      }>
    >(() => [])

    teams.forEach((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      substitutionsByTeam[mainTeam] = contributors.flatMap(
        (team) => substitutionWizardData.substitutionsByTeam[team] || []
      )
    })

    const initialSelections = substitutionWizardData.initialSelections

    return {
      ...substitutionWizardData,
      teams,
      substitutionsByTeam,
      isWizardMode: teams.length > 1,
      initialSelections,
    }
  }, [substitutionWizardData, mergedInto, visibleTeams, teamContributorsByMain])

  return {
    substitutionWizardOpen,
    setSubstitutionWizardOpen,
    substitutionWizardData,
    setSubstitutionWizardData,
    substitutionWizardResolverRef,
    step2WizardAllowBackToSpecialProgramsRef,
    onNonFloatingSubstitutionWizard,
    substitutionWizardDataForDisplay,
    handleSubstitutionWizardConfirm,
    handleSubstitutionWizardCancel,
    handleSubstitutionWizardSkip,
    resetSubstitutionWizardForStepClear,
  }
}
