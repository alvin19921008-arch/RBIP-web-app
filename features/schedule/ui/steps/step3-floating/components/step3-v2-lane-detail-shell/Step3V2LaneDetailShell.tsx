'use client'

import type { ReactNode, RefObject } from 'react'
import { rbipStep32, rbipStep33, rbipStep34 } from '@/lib/design/rbipDesignTokens'
import { cn } from '@/lib/utils'

export type Step3V2LaneDetailShellTheme = 'preferred' | 'adjacent' | 'final'

const THEME_CLASSES: Record<
  Step3V2LaneDetailShellTheme,
  { shell: string; beak: string }
> = {
  preferred: { shell: rbipStep32.detailShell, beak: rbipStep32.detailBeak },
  adjacent: { shell: rbipStep33.detailShell, beak: rbipStep33.detailBeak },
  final: { shell: rbipStep34.detailShell, beak: rbipStep34.detailBeak },
}

/**
 * Shared lane→detail “card + peak” wrapper for Floating PCA Steps 3.2–3.4.
 * Theme picks border/fill/beak colors from `styles/rbip-design-tokens.css`.
 */
export function Step3V2LaneDetailShell(props: {
  theme: Step3V2LaneDetailShellTheme
  detailPanelRef?: RefObject<HTMLDivElement | null>
  beakCenterX?: number | null
  className?: string
  children: ReactNode
}) {
  const { shell, beak } = THEME_CLASSES[props.theme]
  return (
    <div ref={props.detailPanelRef} className={cn(shell, props.className)}>
      <div className={beak} style={{ left: props.beakCenterX ?? 32 }} aria-hidden />
      {props.children}
    </div>
  )
}
