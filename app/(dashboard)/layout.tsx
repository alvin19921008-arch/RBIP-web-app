import { requireAuth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { NavigationLoadingProvider } from '@/components/ui/navigation-loading'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()

  return (
    <div className="min-h-screen min-w-[1440px] bg-background">
      <NavigationLoadingProvider>
        <Navbar />
        <main className="mx-auto w-full" style={{ maxWidth: 'var(--rbip-app-max-width)' }}>
          {children}
        </main>
      </NavigationLoadingProvider>
    </div>
  )
}

