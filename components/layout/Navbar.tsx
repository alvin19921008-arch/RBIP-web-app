'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { CalendarDays, LayoutDashboard, History } from 'lucide-react'

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const navLoading = useNavigationLoading()

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

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
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
        <Button variant="ghost" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </nav>
  )
}

