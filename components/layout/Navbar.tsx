'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'
import { getPreviousWorkingDay } from '@/lib/utils/dateHelpers'
import { formatDateForInput, parseDateFromInput } from '@/lib/features/schedule/date'
import {
  CalendarDays,
  LayoutDashboard,
  History,
  UserCircle,
  LogOut,
  KeyRound,
  ChevronDown,
  UserRoundCog,
  Eye,
  EyeOff,
  SquareSplitHorizontal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { EditProfileDialog } from '@/components/auth/EditProfileDialog'

type AccountRole = 'user' | 'admin' | 'developer'

function roleBadgeVariant(role: AccountRole): 'roleDeveloper' | 'roleAdmin' | 'roleUser' {
  if (role === 'developer') return 'roleDeveloper'
  if (role === 'admin') return 'roleAdmin'
  return 'roleUser'
}

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const navLoading = useNavigationLoading()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [profileName, setProfileName] = useState<string>('Account')
  const [profileRole, setProfileRole] = useState<AccountRole>('user')
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navLoading.start('/login')
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/schedule', label: 'Schedule', icon: CalendarDays },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/history', label: 'History', icon: History },
  ]

  const isSchedulePage = pathname === '/schedule'
  const isViewingMode = isSchedulePage && searchParams.get('view') === '1'
  const isSplitMode = isSchedulePage && searchParams.get('split') === '1'
  const isRefHidden = isSchedulePage && searchParams.get('refHidden') === '1'

  const replaceQueryWithOptionalViewTransition = (href: string, vtName: string) => {
    // Query-param-only UI switches: keep scroll stable and avoid the global nav loading bar.
    const navigate = () => {
      let y = 0
      try {
        y = typeof window !== 'undefined' ? window.scrollY : 0
      } catch {
        y = 0
      }
      router.replace(href)
      try {
        window.requestAnimationFrame(() => {
          try {
            window.scrollTo({ top: y, left: 0, behavior: 'instant' as any })
          } catch {
            window.scrollTo(0, y)
          }
        })
      } catch {
        // ignore
      }
    }

    try {
      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const anyDoc = document as any
      if (!reduceMotion && typeof anyDoc?.startViewTransition === 'function') {
        document.documentElement.dataset.vt = vtName
        const vt = anyDoc.startViewTransition(() => navigate())
        Promise.resolve(vt?.finished)
          .catch(() => {})
          .finally(() => {
            try {
              delete document.documentElement.dataset.vt
            } catch {
              // ignore
            }
          })
        return
      }
    } catch {
      // ignore
    }

    navigate()
  }

  const toggleViewingMode = () => {
    if (!isSchedulePage) return
    const params = new URLSearchParams(searchParams.toString())
    if (params.get('view') === '1') params.delete('view')
    else params.set('view', '1')
    const qs = params.toString()
    const href = qs ? `${pathname}?${qs}` : pathname
    replaceQueryWithOptionalViewTransition(href, 'mode-switch')
  }

  const toggleSplitMode = () => {
    if (!isSchedulePage) return
    const params = new URLSearchParams(searchParams.toString())

    if (params.get('split') === '1') {
      // Turn off split.
      // Persist last-used ref settings in sessionStorage so re-enter restores quickly,
      // but remove split-related params from the URL to avoid getting “stuck” in split mode.
      try {
        const refDate = params.get('refDate')
        const dir = params.get('splitDir')
        const ratio = params.get('splitRatio')
        const hidden = params.get('refHidden')
        if (refDate) window.sessionStorage.setItem('rbip_split_ref_date', refDate)
        if (dir) window.sessionStorage.setItem('rbip_split_dir', dir)
        if (ratio) window.sessionStorage.setItem('rbip_split_ratio', ratio)
        if (hidden) window.sessionStorage.setItem('rbip_split_ref_hidden', hidden)
      } catch {
        // ignore
      }

      params.delete('split')
      params.delete('splitDir')
      params.delete('splitRatio')
      params.delete('refHidden')
      params.delete('refDate')
      const qs = params.toString()
      const href = qs ? `${pathname}?${qs}` : pathname
      replaceQueryWithOptionalViewTransition(href, 'split-switch')
      return
    }

    // Turn on split.
    params.set('split', '1')

    // Seed refDate if missing.
    if (!params.get('refDate')) {
      let seeded: string | null = null
      try {
        seeded = window.sessionStorage.getItem('rbip_split_ref_date')
      } catch {
        seeded = null
      }
      if (!seeded) {
        // Default: previous working day of main ?date=... if present; else today.
        const baseKey = params.get('date')
        let baseDate: Date = new Date()
        if (baseKey) {
          try {
            baseDate = parseDateFromInput(baseKey)
          } catch {
            baseDate = new Date()
          }
        }
        seeded = formatDateForInput(getPreviousWorkingDay(baseDate))
      }
      params.set('refDate', seeded)
    }

    if (!params.get('splitDir')) {
      let dir: string | null = null
      try {
        dir = window.sessionStorage.getItem('rbip_split_dir')
      } catch {
        dir = null
      }
      if (dir !== 'col' && dir !== 'row') dir = 'col'
      params.set('splitDir', dir)
    }

    if (!params.get('splitRatio')) {
      let ratioStr: string | null = null
      try {
        ratioStr = window.sessionStorage.getItem('rbip_split_ratio')
      } catch {
        ratioStr = null
      }
      const ratioNum = ratioStr != null ? Number(ratioStr) : NaN
      const ratio = Number.isFinite(ratioNum) ? Math.max(0.15, Math.min(0.85, ratioNum)) : 0.5
      params.set('splitRatio', ratio.toFixed(3))
    }

    // Restore hidden state if we have it, otherwise default to visible.
    if (!params.get('refHidden')) {
      let hidden: string | null = null
      try {
        hidden = window.sessionStorage.getItem('rbip_split_ref_hidden')
      } catch {
        hidden = null
      }
      params.set('refHidden', hidden === '1' ? '1' : '0')
    }

    const qs = params.toString()
    const href = qs ? `${pathname}?${qs}` : pathname
    replaceQueryWithOptionalViewTransition(href, 'split-switch')
  }

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

  useOnClickOutside(menuRef, () => setMenuOpen(false), { enabled: menuOpen, event: 'pointerdown' })

  return (
    <nav className="border-b bg-background">
      <div className="w-full px-8 flex h-16 items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/schedule" className="text-xl font-bold">
            RBIP Duty List
          </Link>
          <div className="flex space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => navLoading.start(item.href)}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1",
                  pathname === item.href
                    ? "bg-muted/50 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}

            {isSchedulePage ? (
              <>
                <button
                  type="button"
                  onClick={toggleViewingMode}
                  className={cn(
                    'text-sm font-medium transition-colors inline-flex items-center gap-1.5 rounded-md px-2 py-1',
                    isViewingMode
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'text-muted-foreground hover:text-primary hover:bg-muted/50'
                  )}
                  aria-pressed={isViewingMode}
                  title={isViewingMode ? 'Exit viewing mode' : 'Enter viewing mode'}
                >
                  {isViewingMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span>View</span>
                </button>

                <button
                  type="button"
                  onClick={toggleSplitMode}
                  className={cn(
                    'text-sm font-medium transition-colors inline-flex items-center gap-1.5 rounded-md px-2 py-1',
                    isSplitMode
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'text-muted-foreground hover:text-primary hover:bg-muted/50'
                  )}
                  aria-pressed={isSplitMode}
                  title={
                    isSplitMode
                      ? isRefHidden
                        ? 'Split screen: ON (reference retracted)'
                        : 'Split screen: ON'
                      : 'Split screen: OFF'
                  }
                >
                  <SquareSplitHorizontal className="h-4 w-4" />
                  <span>Split</span>
                </button>
              </>
            ) : null}
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
  )
}

