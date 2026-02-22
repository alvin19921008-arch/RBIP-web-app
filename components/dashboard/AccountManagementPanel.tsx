'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast-provider'
import { Plus, Trash2, Pencil, RefreshCw, KeyRound, ChevronDown } from 'lucide-react'
import { SearchWithSuggestions, type SearchSuggestionItem } from '@/components/ui/SearchWithSuggestions'
import { AccessSettingsPanel } from '@/components/dashboard/AccessSettingsPanel'
import { useAccessControl } from '@/lib/access/useAccessControl'

type AccountRole = 'user' | 'admin' | 'developer'

type AccountRow = {
  id: string
  username: string
  email: string | null
  role: AccountRole
  created_at: string | null
  authEmail?: string
}

type EditMode = { mode: 'create' } | { mode: 'edit'; account: AccountRow }

function roleBadgeVariant(role: AccountRole): 'roleDeveloper' | 'roleAdmin' | 'roleUser' {
  if (role === 'developer') return 'roleDeveloper'
  if (role === 'admin') return 'roleAdmin'
  return 'roleUser'
}

function formatDate(iso: string | null): string {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toISOString().slice(0, 10)
}

export function AccountManagementPanel() {
  const supabase = createClientComponentClient()
  const toast = useToast()
  const access = useAccessControl()

  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [myRole, setMyRole] = useState<AccountRole>('user')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'accounts' | 'access-settings'>('accounts')

  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<EditMode | null>(null)
  const [openRoleMenu, setOpenRoleMenu] = useState<{
    id: string
    left: number
    top: number
  } | null>(null)

  const [form, setForm] = useState<{
    username: string
    email: string
    password: string
    role: AccountRole
    resetPassword: string
  }>({
    username: '',
    email: '',
    password: '',
    role: 'user',
    resetPassword: '',
  })

  // Note: visibility is controlled by access settings, but backend permissions are still enforced by API.
  const canManageBackend = myRole === 'admin' || myRole === 'developer'
  const canManageUi = canManageBackend && access.can('accounts.manage')
  const canSeeInternalAuthEmail = canManageBackend && myRole === 'developer' && access.can('accounts.view-auth-email')
  const canResetOthersPassword = canManageBackend && myRole === 'developer' && access.can('accounts.reset-others-password')

  const loadMe = async (): Promise<AccountRole> => {
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id ?? null
    setMyUserId(uid)
    if (!uid) return 'user'

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle()

    const roleRaw = (profile as any)?.role
    const role: AccountRole =
      roleRaw === 'developer' || roleRaw === 'admin' || roleRaw === 'user'
        ? roleRaw
        : roleRaw === 'regular'
          ? 'user'
          : 'user'
    setMyRole(role)
    return role
  }

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounts/list', { method: 'GET' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load accounts')
      setAccounts((json?.accounts || []) as AccountRow[])
      setSelectedIds(new Set())
    } catch (e) {
      toast.error('Failed to load accounts', (e as any)?.message || undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMe().then((role) => {
      if (role === 'admin' || role === 'developer') {
        void loadAccounts()
      } else {
        setAccounts([])
        setSelectedIds(new Set())
        setLoading(false)
        setActiveTab('access-settings')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the role menu when clicking elsewhere.
  useEffect(() => {
    if (!openRoleMenu) return

    const onMouseDown = (e: MouseEvent) => {
      const el = document.getElementById(`role-menu-anchor:${openRoleMenu.id}`)
      if (!el) return
      if (el.contains(e.target as Node)) return
      const menuEl = document.getElementById('account-role-menu')
      if (menuEl && menuEl.contains(e.target as Node)) return
      setOpenRoleMenu(null)
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [openRoleMenu])

  // Close role menu on scroll/resize (keeps positioning sane).
  useEffect(() => {
    if (!openRoleMenu) return
    const close = () => setOpenRoleMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [openRoleMenu])

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) => {
      const fields = [
        a.username,
        a.email ?? '',
        a.role,
        a.created_at ?? '',
        canSeeInternalAuthEmail ? (a.authEmail ?? '') : '',
      ]
      return fields.some((f) => String(f).toLowerCase().includes(q))
    })
  }, [accounts, search, canSeeInternalAuthEmail])

  const accountSearchItems = useMemo<SearchSuggestionItem[]>(() => {
    return accounts.map((a) => ({
      id: a.id,
      label: a.username,
      subLabel: [a.email, a.role].filter(Boolean).join(' • ') || undefined,
      keywords: [
        a.username,
        a.email ?? '',
        a.role,
        a.created_at ?? '',
        canSeeInternalAuthEmail ? (a.authEmail ?? '') : '',
      ].filter(Boolean),
    }))
  }, [accounts, canSeeInternalAuthEmail])

  const allVisibleSelected = filteredAccounts.length > 0 && filteredAccounts.every((a) => selectedIds.has(a.id))

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        filteredAccounts.forEach((a) => {
          if (myUserId && a.id === myUserId) return // don't allow selecting self for deletion
          next.add(a.id)
        })
      } else {
        filteredAccounts.forEach((a) => next.delete(a.id))
      }
      return next
    })
  }

  const openCreate = () => {
    setForm({ username: '', email: '', password: '', role: 'user', resetPassword: '' })
    setDialog({ mode: 'create' })
  }

  const openEdit = (account: AccountRow) => {
    setForm({
      username: account.username,
      email: account.email ?? '',
      password: '',
      role: account.role,
      resetPassword: '',
    })
    setDialog({ mode: 'edit', account })
  }

  const submitDialog = async () => {
    if (!dialog) return
    const username = form.username.trim()
    const email = form.email.trim()
    const role = form.role

    if (!username) {
      toast.warning('Username is required')
      return
    }

    if (dialog.mode === 'create') {
      if (!form.password) {
        toast.warning('Password is required')
        return
      }
      try {
        const res = await fetch('/api/accounts/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            email: email.length > 0 ? email : null,
            password: form.password,
            role,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to create')
        toast.success('Account created')
        setDialog(null)
        await loadAccounts()
      } catch (e) {
        toast.error('Create failed', (e as any)?.message || undefined)
      }
      return
    }

    // edit
    try {
      const res = await fetch('/api/accounts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: dialog.account.id,
          username,
          email: email.length > 0 ? email : null,
          role,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update')

      if (canResetOthersPassword && form.resetPassword.trim().length > 0) {
        const pwRes = await fetch('/api/accounts/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dialog.account.id, newPassword: form.resetPassword }),
        })
        const pwJson = await pwRes.json()
        if (!pwRes.ok) throw new Error(pwJson?.error || 'Password reset failed')
      }

      toast.success('Account updated')
      setDialog(null)
      await loadAccounts()
    } catch (e) {
      toast.error('Update failed', (e as any)?.message || undefined)
    }
  }

  const deleteAccounts = async (ids: string[]) => {
    if (!canManageUi) return
    if (ids.length === 0) return
    try {
      const res = await fetch('/api/accounts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Delete failed')
      toast.success('Deleted', `Deleted ${ids.length} account(s).`)
      await loadAccounts()
    } catch (e) {
      toast.error('Delete failed', (e as any)?.message || undefined)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="inline-flex items-center gap-1 rounded-md border bg-background p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            activeTab === 'accounts'
              ? 'bg-amber-100 text-amber-950'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          ].join(' ')}
        >
          Accounts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('access-settings')}
          className={[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            activeTab === 'access-settings'
              ? 'bg-amber-100 text-amber-950'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          ].join(' ')}
        >
          Access settings
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {activeTab === 'accounts' ? 'Manage system accounts.' : 'Configure UI visibility by role.'}
      </p>

      {/* Action buttons for accounts tab */}
      {activeTab === 'accounts' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={!canManageUi || selectedIds.size === 0 || loading}
              onClick={() => deleteAccounts(Array.from(selectedIds))}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete selected
            </Button>
            <div className="text-xs text-muted-foreground">Selected: {selectedIds.size}</div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={loadAccounts} disabled={loading || !canManageBackend}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={openCreate} disabled={!canManageUi || loading}>
              <Plus className="h-4 w-4 mr-2" />
              Add new accounts
            </Button>
            <SearchWithSuggestions
              value={search}
              onValueChange={setSearch}
              items={accountSearchItems}
              placeholder="Search username/email/role…"
              className="w-[260px]"
              onSelect={(it) => setSearch(it.label)}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="space-y-4">
          {activeTab === 'access-settings' ? (
            <AccessSettingsPanel />
          ) : !canManageBackend ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Account management requires admin/developer permissions.
            </div>
          ) : !canManageUi ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Account management UI is disabled for your role in Access settings.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3 w-[48px]">
                      <Checkbox
                        checked={allVisibleSelected}
                        disabled={!canManageUi || filteredAccounts.length === 0}
                        onCheckedChange={(v) => toggleSelectAllVisible(!!v)}
                      />
                    </th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Email</th>
                    {canSeeInternalAuthEmail ? <th className="p-3">Auth email (internal)</th> : null}
                    <th className="p-3">Created</th>
                    <th className="p-3">Access</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={canSeeInternalAuthEmail ? 7 : 6} className="p-6 text-center text-muted-foreground">
                        {loading ? 'Loading…' : 'No accounts found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((a) => {
                      const isSelf = !!myUserId && a.id === myUserId
                      const canEdit = canManageUi
                      const canDelete = canManageUi && !isSelf
                      const roleOptions: AccountRole[] =
                        myRole === 'developer' ? ['user', 'admin', 'developer'] : ['user', 'admin']
                      return (
                        <tr key={a.id} className="border-t">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedIds.has(a.id)}
                              disabled={!canDelete}
                              onCheckedChange={(v) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev)
                                  if (v) next.add(a.id)
                                  else next.delete(a.id)
                                  return next
                                })
                              }}
                            />
                          </td>
                          <td className="p-3 font-medium">{a.username}</td>
                          <td className="p-3 text-muted-foreground">{a.email ?? '--'}</td>
                          {canSeeInternalAuthEmail ? (
                            <td className="p-3 text-muted-foreground">{a.authEmail ?? '--'}</td>
                          ) : null}
                          <td className="p-3 text-muted-foreground">{formatDate(a.created_at)}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Badge variant={roleBadgeVariant(a.role)} className="capitalize">
                                {a.role}
                              </Badge>
                              <div className="relative" id={`role-menu-anchor:${a.id}`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={!canEdit}
                                  title="Change access"
                                  onClick={(e) => {
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                    const desiredLeft = rect.left
                                    const desiredTop = rect.bottom + 6
                                    const menuWidth = 160
                                    const clampedLeft = Math.max(8, Math.min(desiredLeft, window.innerWidth - menuWidth - 8))
                                    setOpenRoleMenu((prev) =>
                                      prev?.id === a.id ? null : { id: a.id, left: clampedLeft, top: desiredTop }
                                    )
                                  }}
                                  className="h-7 w-7"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" disabled={!canEdit} onClick={() => openEdit(a)} title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!canDelete}
                                onClick={() => deleteAccounts([a.id])}
                                className="text-red-600 hover:text-red-700 dark:text-red-400"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

        <Dialog open={dialog != null} onOpenChange={(open) => (!open ? setDialog(null) : null)}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{dialog?.mode === 'edit' ? 'Edit account' : 'Add new account'}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="acc-username">Username</Label>
                <Input
                  id="acc-username"
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  placeholder="username"
                  disabled={!canManageUi}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="acc-email">Email (optional)</Label>
                <Input
                  id="acc-email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@example.com (can be blank)"
                  disabled={!canManageUi}
                />
              </div>

              {dialog?.mode === 'create' ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="acc-password">Password</Label>
                  <Input
                    id="acc-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Password (case sensitive)"
                    disabled={!canManageUi}
                  />
                </div>
              ) : null}

              <div className="grid gap-1.5">
                <Label>Access</Label>
                <div className="flex items-center gap-2">
                  <Badge variant={roleBadgeVariant(form.role)} className="capitalize">
                    {form.role}
                  </Badge>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!canManageUi}
                      title="Change access"
                      onClick={() => {
                        // cycle through options for quick UX (menu-like but compact)
                        const options: AccountRole[] = myRole === 'developer' ? ['user', 'admin', 'developer'] : ['user', 'admin']
                        const idx = options.indexOf(form.role)
                        const next = options[(idx + 1) % options.length] ?? 'user'
                        setForm((p) => ({ ...p, role: next }))
                      }}
                      className="h-9 w-9"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {myRole === 'admin' ? (
                  <div className="text-xs text-muted-foreground">
                    Admin can set access up to <span className="font-medium">Admin</span> only.
                  </div>
                ) : null}
              </div>

              {dialog?.mode === 'edit' && canResetOthersPassword ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="acc-resetpw">Reset password (Developer only)</Label>
                  <Input
                    id="acc-resetpw"
                    type="password"
                    value={form.resetPassword}
                    onChange={(e) => setForm((p) => ({ ...p, resetPassword: e.target.value }))}
                    placeholder="Leave blank to keep unchanged"
                  />
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" />
                    Password resets are applied when you save.
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button onClick={submitDialog} disabled={!canManageUi}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Floating role menu (fixed-position) to avoid clipping inside overflow containers */}
        {openRoleMenu ? (
          <div
            id="account-role-menu"
            className="fixed z-[9999] w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg p-1"
            style={{ left: openRoleMenu.left, top: openRoleMenu.top }}
          >
            {(() => {
              const a = accounts.find(x => x.id === openRoleMenu.id)
              if (!a) return null
              const roleOptions: AccountRole[] =
                myRole === 'developer' ? ['user', 'admin', 'developer'] : ['user', 'admin']
              return roleOptions.map((r) => (
                <button
                  key={`${a.id}-${r}`}
                  className="w-full flex items-center px-2 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                  onClick={async () => {
                    try {
                      setOpenRoleMenu(null)
                      const res = await fetch('/api/accounts/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: a.id,
                          username: a.username,
                          email: a.email,
                          role: r,
                        }),
                      })
                      const json = await res.json()
                      if (!res.ok) throw new Error(json?.error || 'Update failed')
                      toast.success('Access updated')
                      await loadAccounts()
                    } catch (e) {
                      toast.error('Update failed', (e as any)?.message || undefined)
                    }
                  }}
                >
                  <span className="capitalize">{r}</span>
                </button>
              ))
            })()}
          </div>
        ) : null}
      </div>
    </div>
  )
}

