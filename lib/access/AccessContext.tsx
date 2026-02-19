'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AccessControlSettingsV1, AccessRole } from '@/lib/access/types'
import { normalizeAccessControlSettings } from '@/lib/access/normalize'

type AccessContextValue = {
  role: AccessRole
  settings: AccessControlSettingsV1 | null
}

const DEFAULT_VALUE: AccessContextValue = {
  role: 'user',
  settings: null,
}

const AccessContext = createContext<AccessContextValue>(DEFAULT_VALUE)

export function AccessProvider({
  children,
  initialRole,
  initialSettings,
}: {
  children: ReactNode
  initialRole: AccessRole
  initialSettings: AccessControlSettingsV1 | null
}) {
  return (
    <AccessContext.Provider value={{ role: initialRole, settings: initialSettings }}>
      {children}
    </AccessContext.Provider>
  )
}

export function useAccessContext() {
  return useContext(AccessContext)
}
