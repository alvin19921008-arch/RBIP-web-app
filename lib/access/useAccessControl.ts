'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccessControlResponse, AccessControlSettingsV1, AccessRole, FeatureId } from '@/lib/access/types'
import { canFeature, normalizeAccessControlSettings } from '@/lib/access/normalize'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function useAccessControl() {
  const [status, setStatus] = useState<Status>('idle')
  const [role, setRole] = useState<AccessRole>('user')
  const [settings, setSettings] = useState<AccessControlSettingsV1>(() => normalizeAccessControlSettings(null))
  const [error, setError] = useState<string | null>(null)

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
    void reload()
  }, [reload])

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

