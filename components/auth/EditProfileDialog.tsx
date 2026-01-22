'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast-provider'

type AccountRole = 'user' | 'admin' | 'developer'

function roleBadgeVariant(role: AccountRole): 'roleDeveloper' | 'roleAdmin' | 'roleUser' {
  if (role === 'developer') return 'roleDeveloper'
  if (role === 'admin') return 'roleAdmin'
  return 'roleUser'
}

export function EditProfileDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const supabase = createClientComponentClient()
  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [role, setRole] = useState<AccountRole>('user')

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const userId = data.user?.id
        if (!userId) throw new Error('Not authenticated')

        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('username, email, role')
          .eq('id', userId)
          .maybeSingle()

        if (error) throw new Error(error.message)
        const rawRole = (profile as any)?.role
        const nextRole: AccountRole =
          rawRole === 'developer' || rawRole === 'admin' || rawRole === 'user'
            ? rawRole
            : rawRole === 'regular'
              ? 'user'
              : 'user'
        setRole(nextRole)
        setUsername(String((profile as any)?.username || ''))
        setEmail(String((profile as any)?.email || ''))
      } catch (e) {
        toast.error('Failed to load profile', (e as any)?.message || undefined)
        onOpenChange(false)
      } finally {
        setLoading(false)
      }
    })().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const validationError = useMemo(() => {
    if (!open) return null
    if (loading) return null
    if (!username.trim()) return 'Username is required.'
    return null
  }, [open, loading, username])

  const canSave = open && !loading && !saving && !validationError

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await fetch('/api/accounts/self/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim().length > 0 ? email.trim() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Update failed')

      toast.success('Profile updated')
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error('Update failed', (e as any)?.message || undefined)
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit account profile</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="self-username">Username</Label>
            <Input
              id="self-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              disabled={loading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="self-email">Email (optional)</Label>
            <Input
              id="self-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              disabled={loading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Access</Label>
            <Badge variant={roleBadgeVariant(role)} className="capitalize w-fit">
              {role}
            </Badge>
            <div className="text-xs text-muted-foreground">Access is read-only for your own profile.</div>
          </div>

          {validationError ? (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {validationError}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

