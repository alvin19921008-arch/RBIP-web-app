'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { RBIP_APP_MIN_WIDTH_CLASS } from '@/lib/layoutWidth'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'
import {
  CalendarDays,
  LayoutDashboard,
  History,
  UserCircle,
  LogOut,
  KeyRound,
  ChevronDown,
  UserRoundCog,
  CircleHelp,
  MessageSquarePlus,
  ClipboardList,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { EditProfileDialog } from '@/components/auth/EditProfileDialog'
import { FeedbackButton } from '@/components/feedback/FeedbackButton'
import { useAccessControl } from '@/lib/access/useAccessControl'

type AccountRole = 'user' | 'admin' | 'developer'

function roleBadgeVariant(role: AccountRole): 'roleDeveloper' | 'roleAdmin' | 'roleUser' {
  if (role === 'developer') return 'roleDeveloper'
  if (role === 'admin') return 'roleAdmin'
  return 'roleUser'
}

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const navLoading = useNavigationLoading()
  const access = useAccessControl()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [profileName, setProfileName] = useState<string>('Account')
  const [profileRole, setProfileRole] = useState<AccountRole>('user')
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const [newReportCount, setNewReportCount] = useState(0)
  const [devViewRole, setDevViewRole] = useState<AccountRole | null>(null)
  const isDev = process.env.NODE_ENV !== 'production'

  const showFeedbackNavLink = access.can('feedback.nav-link')
  const showFeedbackReview = access.can('feedback.review')
  const showFloatButton = access.can('feedback.float-button')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navLoading.start('/login')
    router.push('/login')
    router.refresh()
  }

  const baseNavItems = [
    { href: '/schedule', label: 'Schedule', icon: CalendarDays },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/history', label: 'History', icon: History },
    { href: '/help', label: 'Help', icon: CircleHelp },
  ]

  const navItems = [
    ...baseNavItems,
    ...(showFeedbackNavLink && !showFeedbackReview
      ? [{ href: '/feedback', label: 'Feedback', icon: MessageSquarePlus }]
      : []),
    ...(showFeedbackReview
      ? [{ href: '/feedback/review', label: 'Reports', icon: ClipboardList }]
      : []),
  ]

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const userId = data.user?.id
        const fallback = data.user?.email ? data.user.email.split('@')[0] : 'Account'
        if (!userId) {
          if (!cancelled) setProfileName(fallback)
          return
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username, role')
          .eq('id', userId)
          .maybeSingle()

        const name = (profile as any)?.username || fallback
        const rawRole = (profile as any)?.role
        const role: AccountRole =
          rawRole === 'developer' || rawRole === 'admin' || rawRole === 'user'
            ? rawRole
            : rawRole === 'regular'
              ? 'user'
              : 'user'
        if (!cancelled) setProfileName(name)
        if (!cancelled) setProfileRole(role)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, profileRefreshKey])

  // Fetch unread "new" report count for the review badge
  useEffect(() => {
    if (!showFeedbackReview) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/feedback?mode=review&status=new')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setNewReportCount((data.reports ?? []).length)
      } catch {}
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [showFeedbackReview])

  // Load current dev impersonation state on mount (dev-only)
  useEffect(() => {
    if (!isDev || profileRole !== 'developer') return
    fetch('/api/dev/impersonate')
      .then((r) => r.json())
      .then((data) => { if (data.devRole) setDevViewRole(data.devRole) })
      .catch(() => {})
  }, [isDev, profileRole])

  const handleViewAs = async (role: AccountRole) => {
    // Clicking the already-active impersonated role clears it (back to real developer)
    const next = devViewRole === role ? null : role
    await fetch('/api/dev/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    })
    setDevViewRole(next)
    setMenuOpen(false)
    router.refresh()
  }

  useOnClickOutside(menuRef, () => setMenuOpen(false), { enabled: menuOpen, event: 'pointerdown' })

  return (
    <>
    <nav className={cn('border-b bg-background', RBIP_APP_MIN_WIDTH_CLASS)}>
      <div
        className="mx-auto flex w-full px-4 py-3 sm:px-6 lg:px-8 items-center justify-between"
        style={{ maxWidth: 'var(--rbip-app-max-width)' }}
      >
        <div className="flex items-center space-x-8">
          <Link href="/schedule" className="text-xl font-bold">
            RBIP Duty List
          </Link>
          <div className="flex space-x-4">
            {navItems.map((item) => {
              const isReview = item.href === '/feedback/review'
              const badge = isReview && newReportCount > 0 ? newReportCount : 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    navLoading.start(item.href)
                    if (isReview) setNewReportCount(0)
                  }}
                  className={cn(
                    "relative text-sm font-medium transition-colors rbip-hover-scale hover:text-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1",
                    pathname === item.href
                      ? "bg-muted/50 text-foreground"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center tabular-nums">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <Button
            variant="ghost"
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2"
          >
            <UserCircle className="h-5 w-5" />
            <span className="max-w-[160px] truncate">{profileName}</span>
            <Badge variant={roleBadgeVariant(profileRole)} className="capitalize">
              {profileRole}
            </Badge>
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50">
              <div className="p-1">
                <button
                  className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                  onClick={() => {
                    setMenuOpen(false)
                    setEditProfileOpen(true)
                  }}
                >
                  <UserRoundCog className="h-4 w-4 mr-2" />
                  Edit profile
                </button>
                <button
                  className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                  onClick={() => {
                    setMenuOpen(false)
                    setChangePwOpen(true)
                  }}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Change password
                </button>
                {isDev && profileRole === 'developer' && (
                  <>
                    <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
                    <div className="px-3 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 select-none">
                        View as
                      </p>
                      <div className="flex gap-1">
                        {(['developer', 'admin', 'user'] as const).map((r) => {
                          const isActive = devViewRole === r || (devViewRole === null && r === 'developer')
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => void handleViewAs(r)}
                              className={cn(
                                'flex-1 rounded px-1.5 py-1 text-xs font-medium capitalize transition-colors',
                                isActive
                                  ? r === 'developer'
                                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                    : r === 'admin'
                                      ? 'bg-sky-600 text-white'
                                      : 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700'
                              )}
                            >
                              {r === 'developer' ? 'Dev' : r === 'admin' ? 'Admin' : 'User'}
                            </button>
                          )
                        })}
                      </div>
                      {devViewRole && devViewRole !== 'developer' && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 leading-tight">
                          Viewing as {devViewRole} — click active role to reset
                        </p>
                      )}
                    </div>
                  </>
                )}
                <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
                <button
                  className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-red-600 dark:text-red-400"
                  onClick={() => {
                    setMenuOpen(false)
                    handleLogout()
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </button>
              </div>
            </div>
          ) : null}
          <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
          <EditProfileDialog
            open={editProfileOpen}
            onOpenChange={setEditProfileOpen}
            onSaved={() => setProfileRefreshKey((k) => k + 1)}
          />
        </div>
      </div>
    </nav>

    {showFloatButton && (
      <FeedbackButton userRole={profileRole} userName={profileName} />
    )}
    </>
  )
}

