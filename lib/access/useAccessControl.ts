'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccessControlResponse, AccessControlSettingsV1, AccessRole, FeatureId } from '@/lib/access/types'
import { canFeature, normalizeAccessControlSettings } from '@/lib/access/normalize'
import { useAccessContext } from '@/lib/access/AccessContext'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const DEFAULT_SETTINGS = normalizeAccessControlSettings(null)

export function useAccessControl() {
  const context = useAccessContext()

  const [status, setStatus] = useState<Status>(() => (context.role && context.role !== 'user' ? 'ready' : context.settings ? 'ready' : 'idle'))
  const [role, setRole] = useState<AccessRole>(() => context.role || 'user')
  const [settings, setSettings] = useState<AccessControlSettingsV1>(() => context.settings || DEFAULT_SETTINGS)
  const [error, setError] = useState<string | null>(null)

  const hasServerValues = context.role !== 'user' || context.settings !== null

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/access-settings', { method: 'GET' })
      const json = (await res.json()) as Partial<AccessControlResponse> & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'Failed to load access settings')
      const nextRole: AccessRole =
        json.role === 'developer' || json.role === 'admin' || json.role === 'user' ? json.role : 'user'
      setRole(nextRole)
      setSettings(normalizeAccessControlSettings(json.settings))
      setStatus('ready')
    } catch (e) {
      setError((e as any)?.message || 'Failed to load access settings')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (hasServerValues) {
      if (context.role) setRole(context.role)
      if (context.settings) setSettings(context.settings)
      setStatus('ready')
    } else {
      void reload()
    }
  }, [context.role, context.settings, hasServerValues, reload])

  const can = useCallback(
    (featureId: FeatureId) => {
      return canFeature(settings, role, featureId)
    },
    [role, settings]
  )

  const updateRoleFeatures = useCallback(
    async (targetRole: AccessRole, updates: Partial<Record<FeatureId, boolean>>) => {
      const res = await fetch('/api/access-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole, updates }),
      })
      const json = (await res.json()) as Partial<AccessControlResponse> & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'Failed to update access settings')
      const nextRole: AccessRole =
        json.role === 'developer' || json.role === 'admin' || json.role === 'user' ? json.role : role
      setRole(nextRole)
      setSettings(normalizeAccessControlSettings(json.settings))
    },
    [role]
  )

  return useMemo(
    () => ({
      status,
      loading: status === 'loading' || status === 'idle',
      role,
      settings,
      error,
      can,
      reload,
      updateRoleFeatures,
    }),
    [status, role, settings, error, can, reload, updateRoleFeatures]
  )
}
