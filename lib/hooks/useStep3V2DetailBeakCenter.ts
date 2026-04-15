import { useLayoutEffect, useState, type MutableRefObject, type RefObject } from 'react'
import type { Team } from '@/types/staff'

/**
 * Positions a “beak” under the selected lane chip relative to the detail panel (Steps 3.2–3.4).
 * Returns `left` offset in **px** within the detail panel coordinate system, or `null` when disabled.
 *
 * @param remeasureToken Any primitive that should trigger a remeasure when layout/content changes.
 */
export function useStep3V2DetailBeakCenter(
  enabled: boolean,
  detailPanelRef: RefObject<HTMLElement | null>,
  laneButtonRefs: MutableRefObject<Map<Team, HTMLButtonElement>>,
  selectedTeam: Team | null,
  listenScrollCapture: boolean | undefined,
  remeasureToken: string | number
): number | null {
  const [beakCenterX, setBeakCenterX] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!enabled || !selectedTeam) {
      setBeakCenterX(null)
      return
    }

    const updateBeak = () => {
      const detail = detailPanelRef.current
      const btn = laneButtonRefs.current.get(selectedTeam)
      if (!detail || !btn) {
        setBeakCenterX(null)
        return
      }
      const detailRect = detail.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const center = btnRect.left + btnRect.width / 2 - detailRect.left
      const clamped = Math.min(Math.max(center, 24), Math.max(detailRect.width - 24, 24))
      setBeakCenterX(clamped)
    }

    updateBeak()
    window.addEventListener('resize', updateBeak)
    if (listenScrollCapture) {
      window.addEventListener('scroll', updateBeak, true)
    }
    return () => {
      window.removeEventListener('resize', updateBeak)
      if (listenScrollCapture) {
        window.removeEventListener('scroll', updateBeak, true)
      }
    }
  }, [
    enabled,
    selectedTeam,
    listenScrollCapture,
    remeasureToken,
    detailPanelRef,
    laneButtonRefs,
  ])

  return beakCenterX
}
