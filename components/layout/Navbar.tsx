'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'
import { CalendarDays, LayoutDashboard, History, UserCircle, LogOut, KeyRound, ChevronDown, UserRoundCog } from 'lucide-react'
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
                  "text-sm font-medium transition-colors hover:text-primary inline-flex items-center gap-1.5",
                  pathname === item.href
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}
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

