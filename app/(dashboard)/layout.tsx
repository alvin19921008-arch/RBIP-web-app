import { requireAuth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { NavigationLoadingProvider } from '@/components/ui/navigation-loading'
import { getAccessSettings } from '@/lib/access/server'
import { AccessProvider } from '@/lib/access/AccessContext'
import { RBIP_APP_MIN_WIDTH_CLASS } from '@/lib/layoutWidth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()
  const { role, settings } = await getAccessSettings()

  return (
    <div className={`min-h-screen ${RBIP_APP_MIN_WIDTH_CLASS} mx-auto bg-background`} style={{ maxWidth: 'var(--rbip-app-max-width)' }}>
      <NavigationLoadingProvider>
        <AccessProvider initialRole={role} initialSettings={settings}>
          <Navbar />
          <main className="mx-auto w-full" style={{ maxWidth: 'var(--rbip-app-max-width)' }}>
            {children}
          </main>
        </AccessProvider>
      </NavigationLoadingProvider>
    </div>
  )
}
