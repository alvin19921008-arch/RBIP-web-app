'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast-provider'

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const supabase = createClientComponentClient()
  const toast = useToast()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setSaving(false)
    }
  }, [open])

  const validationError = useMemo(() => {
    if (!currentPassword && !newPassword && !confirmNewPassword) return null
    if (!currentPassword) return 'Please enter your current password.'
    if (!newPassword) return 'Please enter a new password.'
    if (newPassword !== confirmNewPassword) return 'New password and confirmation do not match.'
    if (newPassword === currentPassword) return 'New password cannot be the same as current password.'
    return null
  }, [currentPassword, newPassword, confirmNewPassword])

  const canSubmit = open && !saving && !validationError && currentPassword && newPassword && confirmNewPassword

  const handleSave = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const email = userRes.user?.email
      if (!email) throw new Error('Could not determine current user email.')

      // Re-authenticate by signing in with current password.
      const signIn = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signIn.error) throw new Error(signIn.error.message)

      const update = await supabase.auth.updateUser({ password: newPassword })
      if (update.error) throw new Error(update.error.message)

      toast.success('Password updated')
      onOpenChange(false)
    } catch (e) {
      toast.error('Failed to update password', (e as any)?.message || undefined)
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input
              id="pw-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <Input
              id="pw-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (case sensitive)"
              autoComplete="new-password"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pw-confirm">Re-enter new password</Label>
            <Input
              id="pw-confirm"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
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
          <Button onClick={handleSave} disabled={!canSubmit}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

