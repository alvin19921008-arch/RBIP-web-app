'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { HelpCenterDialog } from '@/components/help/HelpCenterDialog'

type HelpCenterContextValue = {
  openHelp: () => void
  closeHelp: () => void
  isOpen: boolean
}

const HelpCenterContext = createContext<HelpCenterContextValue | null>(null)

export function useHelpCenter(): HelpCenterContextValue {
  const ctx = useContext(HelpCenterContext)
  if (!ctx) {
    throw new Error('useHelpCenter must be used within HelpCenterProvider')
  }
  return ctx
}

export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openHelp = useCallback(() => setOpen(true), [])
  const closeHelp = useCallback(() => setOpen(false), [])

  const value = useMemo(
    () => ({ openHelp, closeHelp, isOpen: open }),
    [open, openHelp, closeHelp]
  )

  return (
    <HelpCenterContext.Provider value={value}>
      {children}
      <HelpCenterDialog open={open} onOpenChange={setOpen} />
    </HelpCenterContext.Provider>
  )
}
