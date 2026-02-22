'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast-provider'
import { FEATURE_CATALOG } from '@/lib/access/catalog'
import type { AccessRole, FeatureId } from '@/lib/access/types'
import { useAccessControl } from '@/lib/access/useAccessControl'

type RoleTab = AccessRole

function roleBadgeVariant(role: AccessRole): 'roleDeveloper' | 'roleAdmin' | 'roleUser' {
  if (role === 'developer') return 'roleDeveloper'
  if (role === 'admin') return 'roleAdmin'
  return 'roleUser'
}

function roleTabActiveClasses(role: AccessRole): string {
  // Match the role “feel”:
  // - developer: dark/black
  // - admin: sky
  // - user: emerald
  if (role === 'developer') return 'bg-slate-900 text-white hover:bg-slate-900'
  if (role === 'admin') return 'bg-sky-600 text-white hover:bg-sky-600/90'
  return 'bg-emerald-600 text-white hover:bg-emerald-600/90'
}

function roleTabInactiveClasses(role: AccessRole): string {
  // Keep inactive tabs subtle, but slightly hint at their role color on hover.
  if (role === 'developer') return 'text-muted-foreground hover:bg-slate-900/10 hover:text-foreground'
  if (role === 'admin') return 'text-muted-foreground hover:bg-sky-600/10 hover:text-foreground'
  return 'text-muted-foreground hover:bg-emerald-600/10 hover:text-foreground'
}

function canEditTargetRole(requesterRole: AccessRole, targetRole: AccessRole): boolean {
  if (requesterRole === 'developer') return targetRole === 'admin' || targetRole === 'user'
  if (requesterRole === 'admin') return targetRole === 'user'
  return false
}

export function AccessSettingsPanel() {
  const toast = useToast()
  const access = useAccessControl()
  const [activeRole, setActiveRole] = useState<RoleTab>('user')

  const roleTabs: RoleTab[] = useMemo(() => {
    if (access.role === 'developer') return ['developer', 'admin', 'user']
    if (access.role === 'admin') return ['admin', 'user']
    return ['user']
  }, [access.role])

  const effectiveActiveRole = roleTabs.includes(activeRole) ? activeRole : roleTabs[0]
  const editable = canEditTargetRole(access.role, effectiveActiveRole)

  const groups = useMemo(() => {
    const byGroup: Record<string, Array<{ id: FeatureId; label: string; description?: string }>> = {}
    FEATURE_CATALOG.forEach((f) => {
      if (!byGroup[f.group]) byGroup[f.group] = []
      byGroup[f.group].push({ id: f.id, label: f.label, description: f.description })
    })
    return byGroup
  }, [])

  const groupTitle: Record<string, string> = {
    dashboard: 'Dashboard panels',
    schedule: 'Schedule diagnostics/tools',
    history: 'History actions',
    accounts: 'Account management UI',
  }

  const handleToggle = async (featureId: FeatureId, nextValue: boolean) => {
    try {
      await access.updateRoleFeatures(effectiveActiveRole, { [featureId]: nextValue })
    } catch (e) {
      toast.error('Failed to update access settings', (e as any)?.message || undefined)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-md border bg-background p-1">
          {roleTabs.map((r) => {
            const isActive = r === effectiveActiveRole
            return (
              <button
                key={`role-tab-${r}`}
                type="button"
                onClick={() => setActiveRole(r)}
                className={[
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  isActive ? roleTabActiveClasses(r) : roleTabInactiveClasses(r),
                ].join(' ')}
              >
                {r === 'user' ? 'User' : r === 'admin' ? 'Admin' : 'Developer'}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">You are</span>
          <Badge variant={roleBadgeVariant(access.role)} className="capitalize">
            {access.role}
          </Badge>
        </div>
      </div>

      {!editable ? (
        <div className="text-xs text-muted-foreground">
          {access.role === effectiveActiveRole
            ? 'Peer-level access is read-only.'
            : access.role === 'user'
              ? 'Users cannot edit access settings.'
              : 'This role is read-only for you.'}
        </div>
      ) : null}

      <div className="grid gap-4">
        {(['dashboard', 'schedule', 'history', 'accounts'] as const).map((groupId) => {
          const items = groups[groupId] || []
          if (items.length === 0) return null
          return (
            <Card key={`group-${groupId}`}>
              <CardHeader>
                <CardTitle className="text-base">{groupTitle[groupId]}</CardTitle>
                <CardDescription className="text-sm">
                  Visibility for {effectiveActiveRole === 'user' ? 'users' : effectiveActiveRole}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((f) => {
                  const current = access.settings.roles[effectiveActiveRole]?.[f.id] === true
                  return (
                    <div key={f.id} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{f.label}</div>
                        {f.description ? <div className="text-xs text-muted-foreground">{f.description}</div> : null}
                      </div>
                      <Switch
                        aria-label={`Toggle ${f.label}`}
                        checked={current}
                        disabled={!editable || access.loading}
                        onCheckedChange={(v) => void handleToggle(f.id, v)}
                      />
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

